# Orchestration Layer — Implementation Reference

## What this document covers

This document explains the AI agent orchestration layer introduced in the
`python-agent/` service.  It describes why the code is structured the way it is,
how it maps to the user stories that drove the work, and how each piece relates to
the broader repository context.

---

## Stories closed by this work

| Story | Summary |
|---|---|
| **Story 3** — Agent Interface Framework (PR #1 → `main`) | Defined `BaseAgent` ABC, introduced `ReadinessAgent`, `RiskAgent`, and `CommunicationsAgent`, established the `AgentResult` / `AgentTrace` value objects. |
| **Story 4** — Central Orchestration Layer (this work) | Introduced `AgentOrchestrator`, extracted `NBAAgent`, formalised `AccumulatedContext` + `DerivedOutput`, aligned Firestore write paths with the schema. |
| **Story 5** — Student State Schema (PR #3 → `main`) | Defined the canonical Firestore document shapes in `docs/student-state-schema.json` and `docs/student-state.md`.  The orchestration layer's `DerivedOutput` is the programmatic mirror of the `ai_insights/latest` schema defined there. |

---

## Why there are four agents, not three

Before this work, the pipeline had three agents: Readiness, Risk (which also
generated Next Best Actions), and Communications.  This violated the **Single
Responsibility Principle**: `RiskAgent` was doing two things — evaluating
engagement risk AND synthesising recommended actions.

Story 4 acceptance criteria explicitly required `Readiness → Risk → NBA →
Communications` as four discrete steps.  Splitting NBA into its own agent gives:

1. **Separation of concerns** — engagement risk assessment is a different
   reasoning task from action prioritisation.
2. **Better NBA quality** — `NBAAgent` receives *both* readiness and engagement
   context, so recommendations are grounded in the full picture before actions
   are generated.
3. **Independent testability** — `NBAAgent` can be mocked or replaced without
   touching `RiskAgent`.

---

## How the pipeline works

```
POST /generate-insights
        │
        ▼
AgentOrchestrator.run(state)
        │
        ├─── ReadinessAgent.run(state, ctx={})
        │         output → ctx["readiness"]
        │
        ├─── RiskAgent.run(state, ctx={"readiness": ...})
        │         output → ctx["risk"]
        │
        ├─── NBAAgent.run(state, ctx={"readiness": ..., "risk": ...})
        │         output → ctx["nba"]
        │
        └─── CommunicationsAgent.run(state, ctx={"readiness": ..., "risk": ..., "nba": ...})
                  output → ctx["communications"]
        │
        ▼
DerivedOutput (all outputs merged + agentTrace + generatedAt)
        │
        ├─── HTTP response (synchronous, unblocked)
        │
        └─── background thread → _persist_derived()
                  ├── ai_insights/latest subcollection (heavy payload)
                  └── root doc: readinessLevel + engagementLevel (dashboard summaries)
```

### AccumulatedContext — read-only forward flow

Each agent receives the original immutable `state` dict **plus** an
`AccumulatedContext` containing the outputs of all agents that ran before it.
Agents read from the context; they never write to it.  Only the orchestrator
writes to `AccumulatedContext` after each agent completes.

This guarantees:
- **No coupling between agents** — no agent imports or calls another.
- **Testability** — any agent can be tested in isolation by supplying a mock context.
- **No state mutation** — the original `state` dict is never modified.

### Failure isolation

`BaseAgent.run()` wraps the `build_prompt → _call_llm → parse_output` loop in a
try/except.  If an agent raises (LLM timeout, parse error, etc.), it returns:
- `output: {}` (empty)
- `trace.status: "Failed: <message>"`

The orchestrator **does not stop**.  It logs the failure in the trace, continues
to the next agent, and returns a partial `DerivedOutput`.  The caller (Flask route)
receives whatever was successfully computed, and the `agentTrace` makes the failure
visible for debugging.

---

## Firestore write paths

### Why `ai_insights`, not `ai_outputs`

Earlier code (pre–Story 4) wrote to `ai_outputs/latest`.  The canonical schema
defined in PR #3 (`docs/student-state-schema.json`) names the subcollection
`ai_insights/latest`.  This work corrects the mismatch.

| Location | What is written | Why |
|---|---|---|
| `salesforce_opportunities/{uid}/ai_insights/latest` | Full `DerivedOutput` (heavy AI payload) | Only loaded on student detail page — avoids loading large payloads on every dashboard row. |
| `salesforce_opportunities/{uid}` (root) | `readinessLevel` + `engagementLevel` only | Lightweight fields needed for dashboard list filtering and the recursion guard. |

### Recursion guard note

The Cloud Functions trigger (`syncAiInsightsOnUpdate` in `functions/src/index.ts`)
uses a `DERIVED_FIELDS` blacklist to detect which field changes should NOT
re-trigger AI computation.  The root-level `readinessLevel` / `engagementLevel`
fields written by `_persist_derived()` must be added to that blacklist to prevent
an infinite loop.  That change is tracked as a separate item (see *Out of scope*
below).

---

## Key files

| File | Role |
|---|---|
| `python-agent/agents/base.py` | `BaseAgent` ABC + `AccumulatedContext` + `AgentResult` / `AgentTrace`. |
| `python-agent/agents/readiness_agent.py` | Evaluates checklist completion and timing. |
| `python-agent/agents/risk_agent.py` | Evaluates engagement risk and holistic overview. |
| `python-agent/agents/nba_agent.py` | Generates prioritised Next Best Actions grounded in readiness + risk. |
| `python-agent/agents/communications_agent.py` | Drafts email and SMS outreach aligned with the top NBA. |
| `python-agent/orchestration/orchestrator.py` | `AgentOrchestrator` + `DerivedOutput` TypedDict. |
| `python-agent/main.py` | Flask route — thin adapter that calls orchestrator, starts persistence thread. |
| `python-agent/tests/test_orchestrator.py` | Tests for pipeline order, schema conformance, and failure isolation. |
| `python-agent/tests/test_nba_agent.py` | Tests for NBA output shape and `buttonText` enum enforcement. |
| `docs/student-state-schema.json` | Canonical Firestore schema — `DerivedOutput` keys mirror `ai_insights/latest`. |
| `.claude/skills/py-style/SKILL.md` | Python style contract applied to all agent code (SOLID, Clean Architecture, Google style guide). |

---

## Style contract

All Python code in `python-agent/agents/` and `python-agent/orchestration/` adheres
to the rules in `.claude/skills/py-style/SKILL.md`:

- Google Python Style Guide (80-char lines, 4-space indent).
- Google-style docstrings on all classes and functions.
- Full type annotations on all parameters and return values.
- Named parameters at call sites.
- All imports at module top level — never inside functions or classes.
- SOLID principles: Single Responsibility, Open/Closed (orchestrator takes injected
  agents), Liskov (all agents are substitutable), Interface Segregation (separate
  agent per domain), Dependency Inversion (orchestrator depends on `BaseAgent`, not
  concrete agents).
- Clean Architecture: domain layer (`agents/`) has zero infrastructure dependencies;
  orchestration layer (`orchestration/`) has zero Firestore dependencies; only
  `main.py` touches I/O.

---

## Out of scope (tracked separately)

- **Recursion guard update** — `readinessLevel` / `engagementLevel` should be added
  to the `DERIVED_FIELDS` blacklist in `functions/src/index.ts` so writing these
  fields to the root doc does not re-trigger the AI pipeline.  This ties to Jake's
  feedback on PR #1.
- **Angular UI** changes to read from `ai_insights/latest` subcollection — currently
  the frontend reads `aiInsights.*` from the root document.
- **Routing flags** — orchestrator does not yet support selective agent execution
  based on which fields changed.  Future sprint.
- **ADK wrapping** — `google-adk` is in `requirements.txt` but not yet used.
  Future when agents need tool-use or multi-turn memory.
