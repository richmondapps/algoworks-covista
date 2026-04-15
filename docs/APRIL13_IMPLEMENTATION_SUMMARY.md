# April 13, 2026 — Implementation Summary
## Branch: `feature_april13` → PR #3

---

## Branch Lineage

```
main (777f5b8)
│  feat(ui): minimalist layout constraints
│
├── feature/firestore-trigger-orchestration  [merged → main via PR #1]
│   └── refactor: recursion guard + DERIVED_FIELDS for AI trigger
│
├── PR #2 (merged)
│   └── docs/student-state-schema.json + docs/student-state.md
│       (Student State Model definition — schema contract only, no code)
│
└── feature_april13  ◄── YOU ARE HERE  [PR #3 open]
    └── 22c6fb4  feat(student-state-model): implement subcollection architecture per schema v1
        │
        ├── docs/          ← NEW: formal schema + human-readable docs
        ├── functions/     ← ENHANCED: Cloud Functions triggers
        ├── python-agent/  ← ENHANCED: AI agent + new ingestion endpoints
        ├── src/app/       ← ENHANCED: Angular models, service, detail component
        └── functions/src/sync-from-bq.ts  ← ENHANCED: subcollection ingestion
```

---

## What Problem This Solves

Before this PR, every student's AI output (email drafts, SMS, next best actions, agent traces) lived **directly on the root Firestore document**. This meant:

- The dashboard list-view was downloading **full AI payloads for every student** on every page load
- No clear ownership of which system writes which field
- No formal contract — every team invented their own student JSON shape
- Recursion risk: AI writing back to root could re-trigger itself

This PR **implements the split** defined in the schema docs — lightweight root doc for the dashboard, heavy AI data in subcollections loaded only when needed.

---

## Firestore Architecture (Before vs After)

### Before
```
salesforce_opportunities/{student_id}
└── [EVERYTHING in one flat document]
    ├── name, program, term...          ← profile
    ├── requirements {...}              ← checklist flags
    ├── aiInsights {                    ← HEAVY — loaded even on dashboard list
    │     overviewSummary,
    │     nextBestActions[],
    │     emailDraft,
    │     smsDraft,
    │     agentTrace[]
    │   }
    └── isGeneratingAi
```

### After (this PR)
```
salesforce_opportunities/{student_id}           ← ROOT: lightweight only
├── name, program, term_code...                 ← profile fields
├── requirements { orientationStarted... }      ← aggregated checklist flags
├── readinessLevel: "Medium"                    ← AI summary (dashboard filter)
├── engagementLevel: "High"                     ← AI summary (dashboard filter)
├── isGeneratingAi: false                       ← orchestration signal
├── lastAiError: null                           ← error surface
├── syncTimestamp: 1744571200000                ← recursion guard / freshness
│
├── /personalized_checklists/                   ← SUBCOLLECTION
│   ├── fafsa_submission     { is_satisfied, due_date, category... }
│   ├── initial_portal_login { is_satisfied... }
│   ├── wwow_login           { is_satisfied... }
│   └── contingencies        { is_satisfied... }
│
├── /student_activity_logs/                     ← SUBCOLLECTION (append-only)
│   ├── evt-0001  { activity_category: "Engagement", activity_name: "email_opened"... }
│   ├── evt-0002  { activity_category: "Financial Aid", activity_name: "fafsa_submitted"... }
│   └── ...       (last 50 fetched for AI context; all available for audit)
│
└── /ai_outputs/latest                          ← SUBCOLLECTION (heavy — detail page only)
    ├── generatedAt
    ├── overviewSummary
    ├── readinessRisk   { level, trendDirection, trendNote }
    ├── engagementRisk  { level, trendDirection, trendNote }
    ├── metrics         { timeSinceReserve, timeToProgramStart, timeToCensus }
    ├── nextBestActions []
    ├── emailDraft      { subject, bodyText, bullets[] }
    ├── smsDraft
    └── agentTrace      []
```

---

## Data Flow Diagram (End-to-End)

```
┌─────────────────────────────────────────────────────────────────┐
│                        BigQuery                                 │
│  covista_demo.student_core                                      │
│  covista_demo.r2c_student_activity_log                          │
│  covista_demo.student_courses                                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │  Cloud Scheduler
                  │  POST /sync-bq-to-firestore  (Python agent)
                  │  + sync-from-bq.ts  (Node ingester)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│             Firestore: salesforce_opportunities                 │
│                                                                 │
│  Root doc upsert ──────────────────────────── syncTimestamp ✓   │
│  /personalized_checklists/* write ─────────── idempotent    ✓   │
│  /student_activity_logs/* write ───────────── by log_id     ✓   │
└──────────────┬──────────────────────────────────────────────────┘
               │  Firestore trigger:
               │  aggregateChecklistsOnUpdate
               │  (on write to personalized_checklists/*)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Function: aggregateChecklistsOnUpdate                    │
│  → reads all checklist docs for student                         │
│  → patches root requirements{} + syncTimestamp                  │
└──────────────┬──────────────────────────────────────────────────┘
               │  Root doc update triggers:
               │  syncAiInsightsOnUpdate
               │  (guard: upstreamChanged OR isGeneratingAi flip)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud Function: syncAiInsightsOnUpdate                         │
│  GUARD: skip if only DERIVED_FIELDS changed (no recursion)      │
│  GUARD: skip if isGeneratingAi did NOT flip false→true          │
│                                                                 │
│  → re-fetches latest root doc snapshot                          │
│  → POST /generate-insights  →  Python AI Agent (Cloud Run)      │
│  ← receives Phase 1 core payload (sync)                         │
│  → writes ai_outputs/latest subcollection                       │
│  → patches root: readinessLevel, engagementLevel,               │
│                  aiInsights (backward compat), isGeneratingAi=F │
└──────────────┬──────────────────────────────────────────────────┘
               │  HTTP POST
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Python AI Agent (Cloud Run)  — version 1.6.0                   │
│                                                                 │
│  1. Load last 50 activity logs from subcollection (NEW)         │
│  2. Call Vertex AI Gemini 2.5 Flash — core insights (sync)      │
│  3. Write ai_outputs/latest immediately                         │
│  4. Copy readinessLevel + engagementLevel → root (NEW)          │
│  5. Spawn background thread → Communications Agent              │
│     → generates emailDraft + smsDraft                           │
│     → merges into ai_outputs/latest (NEW; was root before)      │
│                                                                 │
│  New endpoints:                                                 │
│  POST /write-activity-logs  — idempotent subcollection writer   │
│  POST /write-checklists     — idempotent subcollection writer   │
└──────────────┬──────────────────────────────────────────────────┘
               │  Firestore snapshot listener
               │  (Angular watches isGeneratingAi)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Angular UI                                                     │
│                                                                 │
│  Dashboard list-view:                                           │
│  → onSnapshot root docs only (fast, no AI payload download)     │
│  → filters by readinessLevel / engagementLevel (root fields)    │
│                                                                 │
│  Student detail page (opportunity-detail):                      │
│  → on load: parallel fetch of 3 subcollections                  │
│       loadAiOutputs()   → ai_outputs/latest                     │
│       loadChecklists()  → personalized_checklists/*             │
│       loadActivityLogs()→ student_activity_logs/* (desc)        │
│  → signals: aiOutputs, checklists, activityLogs                 │
│                                                                 │
│  "Generate AI" button:                                          │
│  → sets isGeneratingAi=true on root (triggerAiGeneration)       │
│  → watches snapshot until isGeneratingAi===false                │
│  → reloads ai_outputs/latest subcollection                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files Changed

| File | Change Type | Summary |
|---|---|---|
| `docs/student-state-schema.json` | **NEW** | Formal JSON Schema draft-07. Root doc fields, 3 subcollection schemas, ownership matrix |
| `docs/student-state.md` | **NEW** | Human-readable docs: architecture diagram, field tables, Activity Dictionary, example Firestore docs |
| `functions/src/index.ts` | **ENHANCED** | `syncAiInsightsOnUpdate` — subcollection write + merged recursion guard. `aggregateChecklistsOnUpdate` — syncTimestamp stamp |
| `functions/src/sync-from-bq.ts` | **ENHANCED** | Writes to correct collection, adds subcollection ingestion for checklists + activity logs, stamps syncTimestamp |
| `python-agent/main.py` | **ENHANCED** | Context enrichment from activity logs, writes ai_outputs/latest, root summary copy, 2 new endpoints, v1.6.0 |
| `src/app/models/student.ts` | **ENHANCED** | 3 new interfaces (PersonalizedChecklist, StudentActivityLog, AiOutputsLatest), updated Student interface |
| `src/app/services/student.service.ts` | **ENHANCED** | 4 new methods (loadAiOutputs, loadChecklists, loadActivityLogs, triggerAiGeneration), updated generateAiInsights |
| `src/app/components/opportunity-detail/opportunity-detail.component.ts` | **ENHANCED** | 4 new signals, loadSubcollections(), updated generateAi() |

---

## Ownership Matrix (Who Writes What)

| System | Writes these fields/docs |
|---|---|
| **Ingestion pipeline** | Root profile fields, `syncTimestamp`, `lastUpdatedByPipelineAt`, all `personalized_checklists/*`, all `student_activity_logs/*` |
| **`aggregateChecklistsOnUpdate` CF** | Root `requirements{}`, `syncTimestamp` (on aggregation) |
| **`syncAiInsightsOnUpdate` CF** | Root `readinessLevel`, `engagementLevel`, `aiInsights` (backward compat), `isGeneratingAi`, `lastAiError` |
| **Python AI Agent** | `ai_outputs/latest` (exclusively) |
| **Angular UI** | `isGeneratingAi = true` only (to trigger AI) |

---

## Backward Compatibility Note

Root `aiInsights` is deliberately kept in this PR so the existing dashboard continues to work without changes. It will be removed in the next sprint once the Angular detail component is confirmed to fully read from `ai_outputs/latest`.

---

## PR Link
https://github.com/richmondapps/algoworks-covista/pull/3
