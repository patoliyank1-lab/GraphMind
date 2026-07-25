#!/bin/bash
# eval/test-agent.sh
# 
# This script runs the Phase 2 agent against 4 evaluation pairs (simple, filtered, 
# client-side aggregation, and ambiguous) to verify the tool-calling loop.

echo "=========================================="
echo "  TESTING SINGLE-AGENT REASONING LOOP (PHASE 2)"
echo "=========================================="

# Ensure dependencies are installed in the agent directory
cd ../agent
echo "Installing agent dependencies..."
bun install

# We need to make sure the GraphQL API is running in another terminal.
echo ""
echo "Note: The GraphQL API must be running on http://localhost:5000/graphql for this to work."
echo ""

# ---------------------------------------------------------
# Test Cases Based on eval-pairs.md
# ---------------------------------------------------------

# Pair 1: Simple List
# Tests basic tool selection and response formatting without any arguments needed.
echo "------------------------------------------"
echo "Test 1: Simple (Goal: List all repositories.)"
echo "------------------------------------------"
bun run index.ts "List all repositories."
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 2: Filtered 
# Tests passing arguments into a tool call (repoId, and status=FAILED)
echo "------------------------------------------"
echo "Test 2: Filtered (Goal: Show me all the failed builds for core-api.)"
echo "------------------------------------------"
bun run index.ts "Show me all the failed builds for core-api."
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 5: Client-side Aggregation
# Tests if the model can pull broader data and perform reasoning/aggregation (counting failures) locally
echo "------------------------------------------"
echo "Test 3: Aggregation (Goal: Which repo has the most failed builds?)"
echo "------------------------------------------"
bun run index.ts "Which repo has the most failed builds?"
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 10: Ambiguous
# Tests how the model reacts to vague input. Will it synthesize a holistic summary or request clarification?
echo "------------------------------------------"
echo "Test 4: Ambiguous (Goal: How is web-frontend doing?)"
echo "------------------------------------------"
bun run index.ts "How is web-frontend doing?"
