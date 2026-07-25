import Groq from "groq-sdk";
import { tools as hardcodedTools, toolsMap as hardcodedToolsMap, executeQuery } from "./tools";
import { fetchSchema } from "./introspection";
import { generateTools, buildDynamicQuery } from "./schemaToTools";
import * as dotenv from 'dotenv';
import path from 'path';

// ---------------------------------------------------------
// Setup & Configuration
// ---------------------------------------------------------

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("Please set GROQ_API_KEY in .env");
  process.exit(1);
}

// Initialize the Groq SDK Client
const groq = new Groq({ apiKey });

// ---------------------------------------------------------
// Utilities
// ---------------------------------------------------------

/**
 * Exponential backoff wrapper. 
 * Retained as a safety net even though Groq's RPM is much higher.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 4): Promise<T> {
  const backoffs = [5000, 15000, 30000, 60000];
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (e) {
      const err = e as Error & { status?: number, response?: any };
      
      if (err.status === 429 || err.message.includes("429")) {
        let delay = backoffs[attempt] || 60000;
        
        if (err.response && typeof err.response.headers?.get === 'function') {
          const retryAfter = err.response.headers.get('retry-after');
          if (retryAfter) {
            const parsed = parseInt(retryAfter, 10);
            if (!isNaN(parsed) && parsed > 0) delay = parsed * 1000;
          }
        }
        
        attempt++;
        console.warn(`Rate limited (429). Retrying in ${delay}ms... (Attempt ${attempt})`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw e;
      }
    }
  }
  throw new Error("Max retries exceeded due to rate limits.");
}

// ---------------------------------------------------------
// Core Agent Loop
// ---------------------------------------------------------

/**
 * Main function to execute the single-agent reasoning loop using Groq/Llama-3.3.
 */
async function runAgent(goal: string) {
  // --- Phase 3 Dynamic Setup ---
  let schema: any;
  let allTools: Groq.Chat.Completions.CompletionCreateParams.Tool[] = [];
  try {
    schema = await fetchSchema();
    const dynamicTools = generateTools(schema);
    
    // Combine dynamic tools with hardcoded getFullRepoDetail
    const getFullRepoDetailDef = hardcodedTools.find(t => t.function?.name === 'getFullRepoDetail');
    allTools = dynamicTools.filter(t => t.function?.name !== 'getFullRepoDetail');
    if (getFullRepoDetailDef) {
      allTools.push(getFullRepoDetailDef);
    }
  } catch (e) {
    console.error("Failed to fetch schema or generate tools:", (e as Error).message);
    process.exit(1);
  }

  const messages: Groq.Chat.Completions.CompletionCreateParams.Message[] = [
    { 
      role: "system", 
      content: `You are an AI assistant interacting with a dev/CI GraphQL API. Your goal is to answer the user's question using the provided tools.
CRITICAL RULES:
1. NEVER guess or invent IDs (like "all" or plain text names). 
2. If you need a repository ID but only have a name (or need all repos), you MUST call listRepos first to find the exact UUIDs.
3. Never invent parameters that aren't strictly defined in the tool schema.
4. Think step by step. If you need data across all repos, fetch the list of repos first, then call the relevant tool for each repo ID.
5. Do NOT chain tool calls using placeholders (like <<id>> or {{id}}). If you need an ID from listRepos, you MUST call listRepos alone, wait for the response, and then use the real ID in your next turn.
6. NEVER output XML tags or pseudo-code (like <function=...>). Only use standard JSON for your tool calls.
7. For tools that take no arguments (like listRepos), call them with an empty JSON object {} — never with null, the string "null", or any other value.` 
    },
    { role: "user", content: goal }
  ];

  console.log(`\n==========================================`);
  console.log(`Goal: "${goal}"`);
  console.log(`==========================================\n`);
  
  try {
    let maxSteps = 5;
    let finalAnswer = "";
    let lastFailedCallSignature = "";
    let repeatedFailureCount = 0;
    
    while (maxSteps > 0) {
      const response = await withRetry(() => groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages,
        tools: allTools
      }));

      const chatCompletion = response as Groq.Chat.Completions.ChatCompletion;
      const responseMessage = chatCompletion.choices[0].message;
      messages.push(responseMessage);

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        
        for (const call of responseMessage.tool_calls) {
          if (!call.function || !call.function.name) continue;

          const functionName = call.function.name;
          const rawArgs = call.function.arguments;
          console.log(`[Tool Call]: ${functionName}(${rawArgs})`);
          
          let apiResultStr = "";
          try {
            // --- Robust argument normalization ---
            let parsedArgs: Record<string, unknown> = {};
            if (rawArgs && rawArgs.trim() !== "" && rawArgs.trim() !== "null") {
              try {
                const attempt = JSON.parse(rawArgs);
                if (attempt && typeof attempt === "object" && !Array.isArray(attempt)) {
                  parsedArgs = attempt;
                }
              } catch {
                parsedArgs = {};
              }
            }

            // --- Circuit breaker: same tool + same (bad) args repeated back to back ---
            const callSignature = `${functionName}:${JSON.stringify(parsedArgs)}`;
            if (callSignature === lastFailedCallSignature) {
              repeatedFailureCount++;
            } else {
              repeatedFailureCount = 0;
            }
            if (repeatedFailureCount >= 2) {
              throw new Error(
                `This exact call (${functionName} with these arguments) has failed repeatedly. ` +
                `Stop retrying it — try a different approach or report you cannot complete this request.`
              );
            }

            // --- Placeholder validation (unchanged logic, now safe since parsedArgs is guaranteed an object) ---
            for (const [key, value] of Object.entries(parsedArgs)) {
              if (typeof value === 'string' && (
                value.includes('<<') || 
                value.includes('[[') || 
                value.includes('{{') || 
                (value.startsWith('{') && value.endsWith('}'))
              )) {
                throw new Error(`Validation Error: Argument '${key}' contains a placeholder '${value}'. You must wait for the previous tool to return a real ID before calling this tool.`);
              }
            }

            const isHardcoded = functionName === 'getFullRepoDetail';
            if (isHardcoded && hardcodedToolsMap[functionName]) {
              const fn = hardcodedToolsMap[functionName];
              const apiResult = await fn(parsedArgs as any);
              apiResultStr = JSON.stringify(apiResult);
            } else {
              // Phase 3 Dynamic Execution
              const queryStr = buildDynamicQuery(schema, functionName);
              const apiResult = await executeQuery(queryStr, parsedArgs);
              apiResultStr = JSON.stringify(apiResult);
            }
            lastFailedCallSignature = ""; // success clears the breaker
          } catch (e) {
            const err = e as Error;
            console.error(`[Tool Error]: Failed executing ${functionName}:`, err.message);
            apiResultStr = JSON.stringify({ error: err.message });
            lastFailedCallSignature = `${functionName}:${rawArgs}`;
          }

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: functionName,
            content: apiResultStr
          });
        }
        
        maxSteps--;
      } else {
        finalAnswer = responseMessage.content || "";
        break;
      }
    }

    if (maxSteps === 0 && !finalAnswer) {
        console.error("[Agent Warning]: Max tool calling steps exceeded.");
        finalAnswer = "I was unable to complete this request after the maximum allowed tool execution steps. Please try rephrasing or simplifying your request.";
    }
    
    console.log(`\n[Final Answer]:\n${finalAnswer}\n`);
    
  } catch (e) {
    const err = e as Error;
    console.error("[Agent Error]:", err.message);
  }
}

// ---------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------

const args = process.argv.slice(2);
const goal = args.join(" ");

if (!goal) {
  console.log("Usage: npm run agent -- \"Your question here\"");
  console.log("   or: bun run index.ts \"Your question here\"");
  process.exit(1);
}

runAgent(goal);
