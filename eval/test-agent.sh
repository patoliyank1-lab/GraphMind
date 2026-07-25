#!/bin/bash
# eval/test-agent.sh
#
# This script runs the agent (Phase 3: dynamic schema-introspection tools)
# against 4 evaluation pairs (simple, filtered, client-side aggregation, and
# ambiguous) plus a dynamic-discovery check, to verify the tool-calling loop
# still works correctly with dynamically-generated tools instead of the
# original Phase 2 hardcoded set.

echo "=========================================="
echo "  TESTING SINGLE-AGENT REASONING LOOP (PHASE 3 - DYNAMIC TOOLS)"
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
NO_REPL=1 bun run index.ts "List all repositories."
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 2: Filtered
# Tests passing arguments into a tool call (repoId, and status=FAILED)
echo "------------------------------------------"
echo "Test 2: Filtered (Goal: Show me all the failed builds for core-api.)"
echo "------------------------------------------"
NO_REPL=1 bun run index.ts "Show me all the failed builds for core-api."
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 5: Client-side Aggregation
# Tests if the model can pull broader data and perform reasoning/aggregation (counting failures) locally
echo "------------------------------------------"
echo "Test 3: Aggregation (Goal: Which repo has the most failed builds?)"
echo "------------------------------------------"
NO_REPL=1 bun run index.ts "Which repo has the most failed builds?"
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Pair 10: Ambiguous
# Tests how the model reacts to vague input. Will it synthesize a holistic summary or request clarification?
echo "------------------------------------------"
echo "Test 4: Ambiguous (Goal: How is web-frontend doing?)"
echo "------------------------------------------"
NO_REPL=1 bun run index.ts "How is web-frontend doing?"
echo -e "\nSleeping 5 seconds to pace requests...\n"
sleep 5

# Phase 3 proof: Dynamic Discovery
# Tests that a field added to the schema after the agent code was written
# (Query.hello: String) is automatically discovered via introspection and
# callable with zero changes to /agent. This is Phase 3's core deliverable.
echo "------------------------------------------"
echo "Test 5: Dynamic Discovery (Goal: say hello)"
echo "------------------------------------------"
NO_REPL=1 bun run index.ts "say hello"