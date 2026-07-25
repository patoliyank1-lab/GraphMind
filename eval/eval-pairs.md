# Evaluation Pairs: Goal → Expected Query Plan

> **Status:** DRAFT — for review and editing before locking in.
> **Based on:** Seeded data from `api/prisma/seed.ts` as of 2026-07-25.
> **Format:** JSON chosen over markdown for easier automated scoring later
> (parse goal/plan/expected fields programmatically in eval harness).

## Seeded Data Summary (for reference)

| Entity | Data |
|---|---|
| Repos | `core-api`, `web-frontend`, `mobile-app` |
| Environments | `staging`, `production` |
| core-api builds | 2 — SUCCESS (main, 7d ago), FAILED (feature/auth, 2d ago) |
| core-api test runs | 2 — PASSED (15s), FAILED (20s) |
| core-api test results | 4 — Auth spec (PASS, FAIL), Billing spec (PASS, PASS) |
| web-frontend builds | 5 — alternating SUCCESS/FAILED (i=0..4), branch: main |
| web-frontend test runs | 5 — alternating PASSED/FLAKY (10s each) |
| web-frontend test results | 5 — Login Button Render (alternating PASS/FAIL) |
| mobile-app builds | 0 |
| Deployments | 2 — core-api → staging (6d ago), core-api → production (5d ago) |

---

## Eval Pairs

```json
[
  {
    "id": 1,
    "difficulty": "simple",
    "goal": "List all repositories.",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ repos { id name description } }"
      ]
    },
    "expected_answer_shape": "A list of 3 repos: core-api, web-frontend, mobile-app, each with name and description.",
    "notes": null
  },
  {
    "id": 2,
    "difficulty": "simple",
    "goal": "Show me all the failed builds for core-api.",
    "expected_plan": {
      "steps": 2,
      "queries": [
        "{ repos { id name } }",
        "{ builds(repoId: \"<core-api-id>\", status: FAILED) { id branch commitSha startedAt finishedAt } }"
      ],
      "notes": "Step 1 resolves the repo name to an ID. Step 2 uses the filter args on the builds query. Alternatively, an agent could do this in a single nested query — see alternative."
    },
    "alternative_single_query": "{ repos { id name builds { id status branch commitSha } } }  -- then filter client-side for core-api + FAILED",
    "expected_answer_shape": "1 failed build on branch feature/auth, commit f6e5d4c3b2a1, started ~2 days ago.",
    "notes": null
  },
  {
    "id": 3,
    "difficulty": "simple",
    "goal": "What repos have been deployed to production?",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ deployments(environmentId: \"<production-env-id>\") { repo { name } status deployedAt } }"
      ],
      "notes": "Requires knowing the production environment ID, which the agent would need to discover via a preliminary query or by querying deployments with nested environment { name } and filtering."
    },
    "alternative_plan": {
      "steps": 1,
      "queries": [
        "{ repos { name deployments { status deployedAt environment { name } } } }"
      ],
      "notes": "Fetch all repos with deployments, then filter for environment.name === 'production' in the answer synthesis step."
    },
    "expected_answer_shape": "Only core-api has been deployed to production (status: SUCCESS, ~5 days ago).",
    "notes": null
  },
  {
    "id": 4,
    "difficulty": "simple",
    "goal": "Show the latest build for web-frontend.",
    "expected_plan": {
      "steps": 2,
      "queries": [
        "{ repos { id name } }",
        "{ builds(repoId: \"<web-frontend-id>\") { id status branch commitSha startedAt finishedAt } }"
      ],
      "notes": "Agent must identify the most recent build by startedAt. The schema has no 'latest' or 'orderBy' arg, so the agent fetches all builds and picks the newest."
    },
    "expected_answer_shape": "The latest build for web-frontend is commit-0 on branch main, status SUCCESS, started today (i=0 in the seed loop).",
    "notes": null
  },
  {
    "id": 5,
    "difficulty": "filtered",
    "goal": "Which repo has the most failed builds?",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ repos { name builds { status } } }"
      ],
      "notes": "Agent fetches all repos with their builds, counts builds where status === FAILED per repo, and reports the max. No server-side aggregation exists, so the agent must do this in its reasoning step."
    },
    "expected_answer_shape": "web-frontend has the most failed builds (2 out of 5). core-api has 1 failed build. mobile-app has 0.",
    "notes": null
  },
  {
    "id": 6,
    "difficulty": "filtered",
    "goal": "What is the average test duration across all repos?",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ repos { name builds { testRuns { durationMs } } } }"
      ],
      "notes": "Agent fetches all test run durations, computes the average. No aggregation support in the schema, so agent reasons over the raw durationMs values."
    },
    "expected_answer_shape": "7 total test runs. core-api: 15000ms + 20000ms = 35000ms (2 runs). web-frontend: 5 × 10000ms = 50000ms (5 runs). Average across all 7 runs: (35000 + 50000) / 7 ≈ 12,143ms (~12.1 seconds).",
    "notes": null
  },
  {
    "id": 7,
    "difficulty": "filtered",
    "goal": "Which builds on core-api had test failures, and what were the error messages?",
    "expected_plan": {
      "steps": 2,
      "queries": [
        "{ repos { id name } }",
        "{ builds(repoId: \"<core-api-id>\") { id status branch testRuns { testResults { testName status errorMessage } } } }"
      ]
    },
    "expected_answer_shape": "1 build with test failures: the FAILED build on feature/auth branch. Failed test: 'Auth spec' with error 'Expected 200 got 401'. The other test (Billing spec) passed.",
    "notes": null
  },
  {
    "id": 8,
    "difficulty": "multi-hop",
    "goal": "Which tests are flaky across all repos?",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ repos { name builds { branch testRuns { status testResults { testName status } } } } }"
      ],
      "notes": "Agent needs to identify tests that sometimes pass and sometimes fail across different builds. This requires fetching all test results, grouping by testName, and checking for mixed PASS/FAIL statuses. The TestRun.status field also has a FLAKY enum value which is a direct signal."
    },
    "expected_answer_shape": "2 flaky tests identified: (1) 'Login Button Render' in web-frontend — alternates PASS/FAIL across 5 builds, test runs marked FLAKY. (2) 'Auth spec' in core-api — passes in one build, fails in another (though test runs not marked FLAKY, the result pattern is flaky).",
    "notes": null
  },
  {
    "id": 9,
    "difficulty": "multi-hop",
    "goal": "Was core-api deployed to production after its most recent build succeeded or failed?",
    "expected_plan": {
      "steps": 2,
      "queries": [
        "{ repos { id name builds { status startedAt finishedAt } deployments { status deployedAt environment { name } } } }",
        null
      ],
      "notes": "Single query fetches both builds and deployments for all repos. Agent must: (1) filter to core-api, (2) find the production deployment, (3) find the build closest in time before the deployment, (4) report whether that build succeeded or failed. This tests temporal reasoning across two related entities."
    },
    "expected_answer_shape": "core-api's production deployment (~5 days ago) happened after its SUCCESS build on main (~7 days ago) but before its FAILED build on feature/auth (~2 days ago). So it was deployed after a successful build.",
    "notes": null
  },
  {
    "id": 10,
    "difficulty": "ambiguous",
    "ambiguous": true,
    "goal": "How is web-frontend doing?",
    "expected_plan": {
      "steps": 1,
      "queries": [
        "{ repos { name builds { status branch startedAt testRuns { status durationMs testResults { testName status errorMessage } } } deployments { status deployedAt environment { name } } } }"
      ],
      "notes": "AMBIGUOUS — 'doing' is vague. The agent should ideally ask for clarification, or interpret broadly as a health summary. A reasonable interpretation: fetch recent builds, test results, and deployment status, then synthesize a holistic status report."
    },
    "expected_answer_shape": "A summary covering: 5 builds (3 SUCCESS, 2 FAILED), test stability is poor (2 FLAKY test runs, 'Login Button Render' intermittently failing with 'Timeout waiting for selector'), no deployments yet. Overall: unstable — flaky tests need attention before deploying.",
    "notes": "FLAG: This is deliberately ambiguous. Use this to test whether the agent (a) asks for clarification, (b) makes a reasonable broad interpretation, or (c) picks a narrow interpretation and misses context. All three behaviors should be scored differently."
  }
]
```

## Coverage Matrix

| # | Difficulty | Queries | Hops | Key skill tested |
|---|---|---|---|---|
| 1 | Simple | 1 | 0 | Basic list query |
| 2 | Simple | 2 | 1 | Name-to-ID resolution + filter args |
| 3 | Simple | 1 | 1 | Deployment → environment relationship |
| 4 | Simple | 2 | 1 | Temporal reasoning (latest by date) |
| 5 | Filtered | 1 | 1 | Client-side aggregation (count + max) |
| 6 | Filtered | 1 | 2 | Client-side aggregation (average) |
| 7 | Filtered | 2 | 2 | Error message extraction across nested data |
| 8 | Multi-hop | 1 | 3 | Cross-repo pattern detection (flaky = mixed results) |
| 9 | Multi-hop | 1 | 2 | Temporal correlation across builds + deployments |
| 10 | Ambiguous | 1 | 2 | Vague goal interpretation + holistic synthesis |
