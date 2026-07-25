import Groq from "groq-sdk";
import { tools, toolsMap } from "./tools";
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
  // Groq (like OpenAI) requires us to manually maintain the conversation history
  const messages: Groq.Chat.Completions.CompletionCreateParams.Message[] = [
    { 
      role: "system", 
      content: `You are an AI assistant interacting with a dev/CI GraphQL API. Your goal is to answer the user's question using the provided tools.
CRITICAL RULES:
1. NEVER guess or invent IDs (like "all" or plain text names). 
2. If you need a repository ID but only have a name (or need all repos), you MUST call listRepos first to find the exact UUIDs.
3. Never invent parameters that aren't strictly defined in the tool schema.
4. Think step by step. If you need data across all repos, fetch the list of repos first, then call the relevant tool for each repo ID.` 
    },
    { role: "user", content: goal }
  ];

  console.log(`\n==========================================`);
  console.log(`Goal: "${goal}"`);
  console.log(`==========================================\n`);
  
  try {
    let maxSteps = 5;
    let finalAnswer = "";
    
    // Core Reasoning Loop
    while (maxSteps > 0) {
      const response = await withRetry(() => groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        tools: tools
      }));

      const chatCompletion = response as Groq.Chat.Completions.ChatCompletion;
      const responseMessage = chatCompletion.choices[0].message;
      messages.push(responseMessage); // Add assistant's response to history

      // Check if the model wants to call tools
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        
        // Iterate through all tools the model requested to run
        for (const call of responseMessage.tool_calls) {
          if (!call.function || !call.function.name) continue;

          const functionName = call.function.name;
          const functionArgs = call.function.arguments || "{}";
          console.log(`[Tool Call]: ${functionName}(${functionArgs})`);
          
          let apiResultStr = "";
          try {
            const fn = toolsMap[functionName];
            if (!fn) {
              throw new Error(`Tool ${functionName} does not exist`);
            }
            
            const parsedArgs = JSON.parse(functionArgs);
            const apiResult = await fn(parsedArgs);
            apiResultStr = JSON.stringify(apiResult);
          } catch (e) {
            const err = e as Error;
            console.error(`[Tool Error]: Failed executing ${functionName}:`, err.message);
            apiResultStr = JSON.stringify({ error: err.message });
          }

          // Push the tool result back into the message history
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: functionName,
            content: apiResultStr
          });
        }
        
        maxSteps--;
      } else {
        // No tool calls means the model has reached a final answer
        finalAnswer = responseMessage.content || "";
        break;
      }
    }

    if (maxSteps === 0) {
        console.error("[Agent Warning]: Max tool calling steps exceeded.");
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
