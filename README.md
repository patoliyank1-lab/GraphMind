# Introspect

This project builds an autonomous agent that sits in front of a GraphQL API, uses schema introspection to discover what it can do, and independently plans, executes, and reasons over multi-step queries to satisfy a high-level natural language goal.

**Status:** Phases 1-3 are complete! The agent dynamically discovers its tools from the live GraphQL schema and answers natural language questions using a multi-step reasoning loop. Next: Phase 4 (Mutations, auth, and guardrails).

## What this proves
**Zero-Touch Adaptation**: The agent adapts to schema changes without any code modifications. In Phase 3, we successfully proved that adding a completely new field to the GraphQL API (`Query.hello`) immediately results in the agent discovering and correctly using that field. This capability is permanently verified by an automated test (`Test 5`), demonstrating that the system is entirely dynamic and doesn't rely on hardcoded tool definitions.

## Architecture Summary
- **API**: Built with Apollo Server, Express, PostgreSQL, and Prisma. Uses DataLoader for optimized, batch nested resolvers to solve N+1 problems.
- **Agent**: Powered by `openai/gpt-oss-120b` running via Groq. Features a dynamic tool generation system that introspects the API schema at runtime, mapping GraphQL types to JSON Schema tools. Uses a hybrid routing approach to combine dynamic tools with one hardcoded deep-nested tool for complex aggregations.

## Tech Stack
- Node.js & TypeScript
- Apollo Server & GraphQL
- PostgreSQL & Prisma
- Groq API (`openai/gpt-oss-120b`)
- DataLoader (Batching/Caching)

## Setup & Run Instructions

1. Copy the environment template and fill in your keys (including `GROQ_API_KEY`):
   ```bash
   cp .env.example .env
   ```
2. Start the API (Terminal 1):
   ```bash
   cd api
   bun install
   bun run dev
   ```
3. Run the Agent Tests (Terminal 2):
   ```bash
   cd eval
   bash test-agent.sh
   ```
4. Run the Agent Interactively:
   ```bash
   cd agent
   bun index.ts "How is the web-frontend repo doing?"
   ```

## Roadmap

- **Phase 1: API Foundation** (✅ Complete) - GraphQL API on Postgres + Prisma, DataLoader-optimized.
- **Phase 2: Agent Tool Calling** (✅ Complete) - Multi-step reasoning loop using LLM function calling.
- **Phase 3: Schema Introspection** (✅ Complete) - Dynamic runtime discovery and automatic tool generation.
- **Phase 4: Expanding Scope** (Upcoming) - Mutations, authenticated execution, and execution guardrails.

For complete architecture details and planning, see the [Project Report](./DOCS/agentic-graphql-analyst-project-report.md).
