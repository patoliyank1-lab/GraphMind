import Groq from "groq-sdk";
import * as dotenv from 'dotenv';
import path from 'path';
import * as readline from 'readline/promises';
import * as fs from 'fs';

import { fetchSchema } from "./introspection";
import { generateTools, buildDynamicQuery } from "./schemaToTools";
import { tools as hardcodedTools, toolsMap as hardcodedToolsMap, executeQuery } from "./tools";

// Load environment variables from the root .env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Transcript log file
const transcriptFile = path.join(__dirname, 'transcript.json');

// --- Agent Self-Authentication ---
// Note: As a simplification for this learning project, the agent authenticates
// itself by executing a login mutation on startup with test credentials.
// It bypasses a true human OAuth or per-action authorization flow.
let sessionJwt: string | undefined = undefined;

async function authenticateAgent() {
  console.log("[System] Authenticating agent with test credentials...");
  
  // Try signup first (will fail if already exists, which is fine)
  try {
    await executeQuery(`mutation { signup(email: "agent@test.com", password: "agentpassword") }`);
  } catch (e) {
    // Ignore error, likely already exists
  }
  
  // Login
  try {
    const loginResult = await executeQuery(`mutation { login(email: "agent@test.com", password: "agentpassword") }`);
    sessionJwt = loginResult.login;
    console.log("[System] Agent successfully authenticated. Token acquired.");
  } catch (e) {
    console.error("[System Warning] Agent failed to authenticate:", (e as Error).message);
  }
}

/**
 * REPL loop for interactive multi-turn conversation.
 */
async function startRepl(initialGoal?: string) {
  await authenticateAgent();

  // --- Phase 3 & 4 Dynamic Setup ---
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

  let pendingMutation: { toolName: string, argsStr: string } | null = null;

  const messages: Groq.Chat.Completions.CompletionCreateParams.Message[] = [
    { 
      role: "system", 
      content: `You are an AI assistant interacting with a dev/CI GraphQL API. Your goal is to answer the user's question using the provided tools.
CRITICAL RULES:
1. NEVER guess or invent IDs. If you need an ID, you MUST call listRepos or another query first to find the exact UUIDs.
2. Never invent parameters that aren't strictly defined in the tool schema.
3. Think step by step. If you need data across all repos, fetch the list of repos first, then call the relevant tool for each repo ID.
4. Do NOT chain tool calls using placeholders (like <<id>>). Use the real ID from a previous turn.
5. If you call a tool tagged with [MUTATION], it will be blocked on your first attempt. You MUST ask the user for confirmation in plain text. Only if the user says yes, re-call the exact same tool with the exact same arguments to execute it.`
    }
  ];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const runLLMTurn = async () => {
    let maxSteps = 10;
    while (maxSteps > 0) {
      const response = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages,
        temperature: 0,
        tools: allTools
      });

      const responseMessage = response.choices[0].message;
      messages.push(responseMessage);

      // Write transcript
      fs.writeFileSync(transcriptFile, JSON.stringify(messages, null, 2));

      let blockedMutation = false;

      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        for (const call of responseMessage.tool_calls) {
          if (!call.function || !call.function.name) continue;

          const functionName = call.function.name;
          const rawArgs = call.function.arguments;
          
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = rawArgs ? JSON.parse(rawArgs) : {};
          } catch (e) {
            console.error(`[Agent Warning]: Failed to parse args for ${functionName}:`, rawArgs);
          }

          console.log(`\n[Agent calls tool]: ${functionName}`);
          console.log(`[Args]: ${JSON.stringify(parsedArgs)}\n`);

          let apiResultStr = "";
          try {
            const isHardcoded = functionName === 'getFullRepoDetail';
            if (isHardcoded && hardcodedToolsMap[functionName]) {
              const fn = hardcodedToolsMap[functionName];
              const apiResult = await fn(parsedArgs as any); // Hardcoded tools do not require auth for now
              apiResultStr = JSON.stringify(apiResult);
            } else {
              // Dynamic Execution
              const { queryStr, isMutation } = buildDynamicQuery(schema, functionName);
              
              if (isMutation) {
                const argsStr = JSON.stringify(parsedArgs);
                const isExactMatch = pendingMutation && pendingMutation.toolName === functionName && pendingMutation.argsStr === argsStr;
                
                if (!isExactMatch) {
                  console.log(`[System Guardrail] Blocked unconfirmed mutation: ${functionName}`);
                  pendingMutation = { toolName: functionName, argsStr };
                  apiResultStr = JSON.stringify({ 
                    error: "MUTATION_BLOCKED_NEEDS_CONFIRMATION",
                    message: "Mutation blocked. The system has automatically prompted the user for confirmation. Wait for their reply."
                  });
                  blockedMutation = true;
                } else {
                  console.log(`[System Guardrail] Executing confirmed mutation: ${functionName}`);
                  const apiResult = await executeQuery(queryStr, parsedArgs, sessionJwt);
                  apiResultStr = JSON.stringify(apiResult);
                  pendingMutation = null; // Clear it after execution
                }
              } else {
                const apiResult = await executeQuery(queryStr, parsedArgs, sessionJwt);
                apiResultStr = JSON.stringify(apiResult);
              }
            }
          } catch (err: any) {
            apiResultStr = JSON.stringify({ error: err.message });
          }

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: functionName,
            content: apiResultStr
          });

          // Write transcript after tool call
          fs.writeFileSync(transcriptFile, JSON.stringify(messages, null, 2));
        }

        if (blockedMutation) {
          const syntheticMsg = `I am about to execute the \`${pendingMutation!.toolName}\` mutation with arguments: \`${pendingMutation!.argsStr}\`. Do you want to proceed? (yes/no)`;
          console.log(`\n[Agent]: ${syntheticMsg}\n`);
          messages.push({
            role: "assistant",
            content: syntheticMsg
          });
          fs.writeFileSync(transcriptFile, JSON.stringify(messages, null, 2));
          break; // Break out of LLM turn, immediately ask user for input
        }
        
        maxSteps--;
      } else {
        const finalAnswer = responseMessage.content || "";
        console.log(`\n[Agent]: ${finalAnswer}\n`);
        break;
      }
    }

    if (maxSteps === 0) {
      console.log(`\n[Agent Warning]: Max tool calling steps exceeded.\n`);
    }
  };

  if (initialGoal) {
    console.log(`\n[User]: ${initialGoal}`);
    messages.push({ role: "user", content: initialGoal });
    fs.writeFileSync(transcriptFile, JSON.stringify(messages, null, 2));
    await runLLMTurn();
  }

  if (process.env.NO_REPL) {
    rl.close();
    return;
  }

  // Interactive Loop
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      break;
    }
    if (!input.trim()) continue;

    messages.push({ role: "user", content: input });
    fs.writeFileSync(transcriptFile, JSON.stringify(messages, null, 2));
    await runLLMTurn();
  }

  rl.close();
}

// ---------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------

const args = process.argv.slice(2);
const goal = args.join(" ");

startRepl(goal).catch(e => {
  console.error("[Fatal Error]:", e);
  process.exit(1);
});
