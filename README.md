# Introspect

This project builds an autonomous agent that sits in front of a GraphQL API, uses schema introspection to discover what it can do, and independently plans, executes, and reasons over multi-step queries to satisfy a high-level natural language goal.

**Status:** Phase 1 complete — GraphQL API with schema, Postgres DB, seed data, resolvers, DataLoader batching, and 10 eval pairs. Next: Phase 2 (agent reasoning loop).

See the full project report for architecture details: [agentic-graphql-analyst-project-report.md](./DOCS/agentic-graphql-analyst-project-report.md)

## Setup Instructions

1. Copy the environment template: `cp .env.example .env`
2. Navigate to the api directory: `cd api`
3. Install dependencies: `npm install` (or `bun install`)
4. Start the server: `npm run dev` (or `bun run dev`)
