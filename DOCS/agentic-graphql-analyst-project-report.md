# Project Report: Introspect (Agentic Data Analyst over a GraphQL API)

**Status:** Planning / Phase 0
**Owner:** _[your name]_
**Last updated:** 2026-07-25
**Type:** Personal learning project → potential startup seed

---

## 1. Overview

### 1.1 Problem Statement
Most data interfaces (REST, GraphQL, SQL) require the user to already know what question they're asking and how to phrase it as a query. Non-technical stakeholders — and even technical ones under time pressure — often know their *goal* ("find our top churn risks this month") but not the specific queries needed to answer it.

This project builds an **autonomous agent** that sits in front of a GraphQL API, uses schema introspection to discover what it can do, and independently plans, executes, and reasons over multi-step queries to satisfy a high-level natural language goal — optionally taking action via mutations.

### 1.2 Why This Project
- Combines two genuinely deep technical areas (GraphQL schema design, agentic AI systems) rather than treating either superficially.
- Schema introspection as dynamic tool discovery is an underexplored pattern — most agent tutorials hardcode their tool list.
- No fixed deadline allows the project to grow from a single-agent loop into a multi-agent system with custom ML components, rather than stopping at a demo.
- Doubles as a credible seed for a product (an "ops copilot" pattern is broadly applicable — support, sales, internal tooling).

### 1.3 Goals / Non-Goals

**Goals:**
- Agent can take a plain-English goal and autonomously produce a correct, multi-step GraphQL query plan.
- Agent discovers available operations via introspection rather than hardcoded tool definitions.
- Agent can self-correct on failed or empty query results.
- System supports guarded mutations (write actions) with human confirmation.
- Eventually: replace LLM-based tool selection with a custom-trained ranking/classification model.

**Non-Goals (for now):**
- Not building a general-purpose agent framework — scope is bound to GraphQL-shaped tasks.
- Not optimizing for production-scale concurrency/multi-tenant use in early phases.
- Not targeting a specific existing GraphQL API (e.g., GitHub's) until the core loop is proven on a self-designed schema.

---

## 2. Architecture

### 2.1 High-Level Flow

```
User Goal (natural language)
        │
        ▼
 ┌───────────────┐
 │  Planner Agent │  ← breaks goal into sub-tasks
 └───────┬───────┘
         │
         ▼
 ┌────────────────────┐
 │ Schema Introspector │  ← discovers available queries/mutations from GraphQL schema
 └───────┬────────────┘
         │
         ▼
 ┌───────────────┐        ┌──────────────┐
 │ Querier Agent │───────▶│ GraphQL API  │
 └───────┬───────┘        └──────────────┘
         │  (results / errors)
         ▼
 ┌───────────────┐
 │  Critic Agent  │  ← validates results, triggers retry/replan if needed
 └───────┬───────┘
         │
         ▼
 ┌────────────────────┐
 │ Action / Response   │  ← final answer, or guarded mutation with confirmation
 └────────────────────┘
```

### 2.2 Components

| Component | Responsibility | Phase Introduced |
|---|---|---|
| GraphQL API | Serves domain data via queries/mutations | 1 |
| Planner Agent | Decomposes high-level goal into ordered sub-tasks | 2 |
| Schema Introspector | Converts live GraphQL schema into agent-usable tool definitions | 3 |
| Querier Agent | Executes GraphQL operations, handles pagination/filtering | 2–3 |
| Critic Agent | Validates querier output, flags anomalies/failures, requests retries | 5 |
| Mutation Guardrail | Confirms write actions before execution, logs for audit | 4 |
| Memory Store | Retains context across multi-turn sessions | 4 |
| Custom Tool-Ranker | ML model replacing LLM-based operation selection | 6 (optional) |

---

## 3. Tech Stack

**Rationale for Node.js over Python:** We chose Node.js/Apollo to avoid fighting less-mature Python GraphQL tooling while learning agentic concepts. If we reach the optional Phase 6 ML components, they will be built in Python but run as an isolated microservice called by the Node backend, which is a standard production architecture.

| Layer | Choice | Notes |
|---|---|---|
| GraphQL Server | **Apollo Server (Node.js/TypeScript)** | |
| Agent Orchestration | Custom state machine first → LangGraph once loop is proven | Avoid black-box frameworks until the core loop is understood |
| LLM | Claude / GPT via API | Used for planning + reasoning in phases 1–5 |
| Vector/Memory Store | Optional — pgvector or SQLite for early phases | Only needed once cross-session memory is added (Phase 4) |
| Custom ML (Phase 6) | Python (isolated microservice) | Called from Node backend; lightweight classifier/ranker trained on logs |
| Domain Dataset | Dev/CI metrics | Repos, Builds, TestRuns, Deployments |

---

## 4. Phased Roadmap

### Phase 1 — GraphQL Foundation
- Design a non-trivial schema (not just CRUD — include relationships, filters, pagination).
- Implement resolvers against a real or seeded dataset.
- **Deliverable:** Working GraphQL API, explorable via GraphiQL/Apollo Studio.

### Phase 2 — Single-Agent Reasoning Loop
- Agent receives a goal, produces a plan, manually-mapped to a fixed set of queries (introspection not yet dynamic).
- No autonomy in tool selection yet — focus on structured planning + answer synthesis.
- **Deliverable:** CLI or notebook demo: goal in, grounded answer out.

### Phase 3 — Dynamic Schema Introspection
- Agent reads the live schema via introspection query and converts types/fields into callable "tools" at runtime.
- Agent selects which operations to call without hardcoded mappings.
- **Deliverable:** Agent adapts automatically when the schema changes (add a field/type, no code changes needed).

### Phase 4 — Mutations + Guardrails + Memory
- Add write capability (mutations) gated behind explicit confirmation.
- Add session memory so multi-turn conversations retain context.
- **Deliverable:** Agent can both answer questions and take confirmed actions (e.g., "flag this account" → mutation).

### Phase 5 — Multi-Agent Split
- Separate Planner / Querier / Critic roles.
- Critic evaluates querier output for correctness, triggers replanning on failure/empty results.
- **Deliverable:** Agent self-corrects visibly (log shows retry reasoning) instead of returning wrong/empty answers silently.

### Phase 6 — Custom ML Tool-Selection (Optional, Advanced)
- Log (goal, chosen operation) pairs from earlier phases.
- Train a lightweight classifier/ranker to replace LLM-based operation selection for latency/cost reduction.
- **Deliverable:** Hybrid system — custom model handles common cases, LLM handles novel/ambiguous ones.

---

## 5. Evaluation Plan

Since this is ongoing, define what "working" means at each phase rather than only at the end:

| Metric | How to Measure |
|---|---|
| Plan correctness | Manually curated set of (goal → expected query plan) pairs, scored for match |
| Execution success rate | % of agent runs that return a valid, non-empty, correct result |
| Self-correction rate | % of initially-failed queries that succeed after Critic-triggered retry |
| Schema adaptability | Add a new field/type to schema; measure whether agent uses it without code changes |
| Mutation safety | 0% of mutations executed without explicit confirmation (hard requirement, not a %) |

---

## 6. Open Decisions

- **Domain dataset:** [DECIDED] Dev/CI metrics (Repos, Builds, TestRuns, Deployments).
- **Framework timing:** [DECIDED] Build custom state machine first, then adopt LangGraph once core loop is proven.
- **Hosting:** Local-only during development vs. early deployment (e.g., Render/Fly.io) for a shareable demo.

---

## 7. Risks / Known Challenges

- **Schema introspection → tool definition mapping** is non-trivial for complex/nested types; may need custom flattening logic.
- **Agent hallucinating field names** not present in the schema — mitigated by validating generated queries against the introspected schema before execution.
- **Mutation safety** — guardrails must be airtight before this moves beyond a local/dev environment.
- **Scope creep** — given no deadline, risk of over-engineering Phase 1 instead of reaching the agentic core; timebox early phases loosely.

---

## 8. Next Actions

- [ ] Pick domain dataset (see §6)
- [ ] Draft initial GraphQL schema (types, queries, mutations)
- [ ] Set up repo structure (`/api`, `/agent`, `/eval`)
- [ ] Build Phase 1 GraphQL server with seed data
- [ ] Write first 10 (goal → expected plan) eval pairs before writing agent code

---

## Appendix: Reference Reading

- GraphQL Introspection docs — `graphql.org/learn/introspection`
- LangGraph docs — for when Phase 3+ warrants a framework
- Anthropic's guide on building effective agents — planning/tool-use patterns applicable to Planner/Critic split
