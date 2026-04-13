# Student State Model — v1.0

## What this document is

This is the canonical data contract for the unified student state in the Covista R2C system. It defines the shape, source, and ownership of every field consumed by downstream components: the Angular ES dashboard, the Python AI agents, and the Cloud Functions orchestration triggers.

This document does **not** contain ingestion logic, recompute logic, or agent logic.

---

## Architecture

```
Salesforce / SIS / Banner
        │
        ▼
BigQuery (source of truth — read only)
├── r2c_student_profile
└── r2c_student_activity_log
        │
        ▼  ingestion pipeline (BQ → Firestore)
Firestore — salesforce_opportunities/{student_id}
│
├── [root document]              ← lightweight, indexable fields
│     profile + timing + risk summary + system flags
│
├── /personalized_checklists/    ← subcollection
│     one doc per checklist item
│
├── /student_activity_logs/      ← subcollection
│     raw event ledger from BQ
│
└── /ai_outputs/latest           ← subcollection
      heavy AI outputs (email, SMS, NBA, traces)
              │
              ▼ written back by Python AI agent
Angular UI  ←→  Cloud Functions  ←→  Python AI Agent (Vertex AI / Gemini)
```

### Why subcollections?

Firestore does not support partial reads. If email drafts, agent traces, and next best actions were stored in the root document, every dashboard row load would pull the full AI payload for every student — causing catastrophic data sizes and unacceptable read latency at scale.

**Rule:** The root document contains only what the dashboard list view needs. Everything else loads on demand when an ES opens a student's detail page.

### Note on current BQ tables

The BQ dataset (`covista_demo`) currently contains prototype tables: `student_core`, `student_courses`, and `student_contingencies`. The data contract v17.5 defines the target tables (`r2c_student_profile`, `r2c_student_activity_log`) that will replace them. This schema is aligned with the **target contract**.

---

## Root Document

**Path:** `salesforce_opportunities/{student_id}`

Contains only lightweight, filterable fields needed to hydrate the main dashboard.

### Profile fields — source: `r2c_student_profile`

| Field | Type | Required | Description |
|---|---|---|---|
| `student_id` | string | yes | Primary identifier |
| `student_name` | string | yes | Full display name |
| `institution` | string | no | Institution code |
| `program` | string | no | Program code (e.g. MSEL) |
| `program_name` | string | no | Program full name |
| `term_code` | string | no | Term code (e.g. 2026-T1) |
| `term_desc` | string | no | Term description (e.g. Spring 2026) |
| `status_stage` | string | no | Enrollment stage (e.g. Enrolled, Reserved) |
| `enrollment_specialist_name` | string | no | Assigned ES full name |
| `funding_type` | string | no | Funding type (e.g. Federal, Private) |
| `program_start_date` | timestamp | no | Program start date |
| `reserve_date` | timestamp | no | Date student reserved their seat |
| `census_date` | timestamp | no | Census date — all activity must be ≤ this |
| `time_to_program_start_days` | integer | no | Days until program start, computed at ingestion |
| `time_since_reserve_days` | integer | no | Days since reserve, computed at ingestion |
| `last_updated_at` | timestamp | no | Last update in the source system |

### Derived summary fields — source: AI agent (lightweight copy)

These are the **only** AI fields stored at the root. They are lightweight summaries copied from `ai_outputs/latest` to support dashboard filtering and the recursion guard. Full content lives in the `ai_outputs` subcollection.

| Field | Type | Values | Description |
|---|---|---|---|
| `readinessLevel` | string | High / Medium / Low | Readiness risk summary for dashboard |
| `engagementLevel` | string | High / Medium / Low | Engagement risk summary for dashboard |

### System fields — source: orchestration layer

| Field | Type | Description |
|---|---|---|
| `isGeneratingAi` | boolean | `true` while AI is running. Writing `true` from **any source** (UI button, BQ sync, Pub/Sub, Airflow) triggers a full recompute via `syncAiInsightsOnUpdate`. |
| `syncTimestamp` | integer | Unix ms of last BQ sync. Treated as derived — does not re-trigger AI. |
| `lastAiError.message` | string | Error message if last generation failed |
| `lastAiError.at` | timestamp | When the error occurred |

---

## Subcollection: `personalized_checklists`

**Path:** `salesforce_opportunities/{student_id}/personalized_checklists/{checklist_id}`

One document per checklist item. Written by the ingestion pipeline. The Cloud Function `aggregateChecklistsOnUpdate` reads all items and patches a requirements summary to the root document, which then triggers AI recomputation.

### Known document IDs

| `checklist_id` | Maps to |
|---|---|
| `initial_portal_login` | Portal login completed |
| `fafsa_submission` | FAFSA submitted + funding plan |
| `course_registration` | Course registration complete |
| `wwow_login` | WWOW orientation started |
| `contingencies` | Official transcripts + nursing license |
| `logged_into_course` | First assignment submitted |
| `class_participation` | Assignment by census day |

### Document schema

| Field | Type | Description |
|---|---|---|
| `is_satisfied` | boolean | Whether this checklist item is complete |
| `updated_at` | timestamp | Last update |

---

## Subcollection: `student_activity_logs`

**Path:** `salesforce_opportunities/{student_id}/student_activity_logs/{log_id}`

Raw event ledger replicated from `r2c_student_activity_log` in BigQuery. Each event is a separate document. Only loaded when an ES opens the student detail page.

### Activity Dictionary

| `activity_category` | `activity_name` |
|---|---|
| `student_event` | `initial_portal_login` |
| `student_event` | `fafsa_submission` |
| `student_event` | `alternate_funding_submission` |
| `student_event` | `first_course_registration` |
| `student_event` | `wwow_login` |
| `student_event` | `logged_into_course` |
| `student_event` | `discussion_board_submission` |
| `student_event` | `course_drop` |
| `task_history` | `phone_call` |
| `task_history` | `email` |
| `task_history` | `text` |
| `task_history` | `chat` |
| `task_history` | `file_review` |
| `case` | `case_opened` |
| `case` | `case_updated` |
| `case` | `case_closed` |
| `contingency` | `contingency` |
| `system_event` | `reserved` |

### Case Type / Subtype Taxonomy

| `case_type` | `case_subtype` |
|---|---|
| CCT | Login Credentials |
| CCT | Student Portal |
| Course Registration Help | Add Course |
| Course Registration Help | Drop Course |
| Course Registration Help | Transcript Request Inquiry (TRF) |
| Student Issue | Portal Issues |
| Student Issue | University Credentials Missing/Not Created |

### Document schema

| Field | Type | Notes |
|---|---|---|
| `log_id` | string | Required |
| `student_id` | string | Required |
| `term_code` | string | Required |
| `activity_category` | string | Required. See Activity Dictionary above |
| `activity_name` | string | Required. See Activity Dictionary above |
| `activity_datetime` | timestamp | Must be ≤ `census_date` |
| `actor` | string / null | `student`, `enrollment_specialist`, `system` |
| `source_system` | string | Originating system (e.g. Salesforce, SIS) |
| `last_updated_timestamp` | timestamp | Used for incremental ingestion |
| `communication_type` | string / null | Present on `task_history`. Phone, Email, Text, Chat, File Review |
| `task_notes` | string / null | Required on `task_history` events |
| `task_comments` | string / null | Required on `task_history` events |
| `task_status` | string / null | Required on `task_history` events |
| `case_number` | string / null | Present on `case` events |
| `case_subject` | string / null | |
| `case_type` | string / null | See taxonomy above |
| `case_subtype` | string / null | See taxonomy above |
| `case_status` | string / null | `open`, `in_progress`, `pending`, `resolved`, `closed` |
| `case_closed_reason` | string / null | |
| `case_closed_datetime` | timestamp / null | |
| `case_created_date` | date / null | Must be ≤ `census_date` |
| `case_comments` | string / null | |
| `course_identification` | string / null | Present on course-related events |
| `course_level` | string / null | |
| `course_status` | string / null | |
| `is_accredited` | boolean / null | |
| `contingency_document_flag` | boolean / null | Include only where `true` |
| `institution_name` | string / null | |
| `institution_name_text` | string / null | |
| `contingency_description` | string / null | |

---

## Subcollection: `ai_outputs`

**Path:** `salesforce_opportunities/{student_id}/ai_outputs/latest`

Heavy AI-generated content. Single document keyed `latest`. Only loaded when an ES opens the student detail page. Written exclusively by the Python AI agent via the Cloud Functions orchestration trigger (`syncAiInsightsOnUpdate`). Never sourced from BQ. Never manually set.

### Document schema

| Field | Type | Description |
|---|---|---|
| `overviewSummary` | string | Holistic narrative for the ES. Combines readiness + engagement. |
| `readinessRisk.level` | High / Medium / Low | Full readiness assessment |
| `readinessRisk.trendDirection` | up / down / stable | 7-day trajectory |
| `readinessRisk.trendNote` | string | Latest readiness activity |
| `engagementRisk.level` | High / Medium / Low | Full engagement assessment |
| `engagementRisk.trendDirection` | up / down / stable | 7-day trajectory |
| `engagementRisk.trendNote` | string | Latest engagement activity |
| `metrics.timeSinceReserve` | string | e.g. "63 days" |
| `metrics.timeToProgramStart` | string | e.g. "9 days" |
| `metrics.timeToCensus` | string | e.g. "20 days" |
| `nextBestActions` | array | Prioritized action items for the ES |
| `nextBestActions[].title` | string | Action commanding the ES |
| `nextBestActions[].urgent` | boolean | High-priority flag |
| `nextBestActions[].points` | string[] | Step-by-step ES instructions |
| `nextBestActions[].buttonText` | string | `"Review Requirement"` or `"Complete Task >"` |
| `emailDraft.bodyText` | string | Two-paragraph body, no greeting |
| `emailDraft.bullets` | string[] | Actionable items for the email |
| `smsDraft` | string | Max 140 chars, addressed to student |
| `agentTrace` | array | Agent execution trace for debugging |
| `generatedAt` | timestamp | When this generation completed |

---

## Example State Document

### Root document — `salesforce_opportunities/A00302996`

```json
{
  "student_id": "A00302996",
  "student_name": "Amy Collins",
  "institution": "Covista University",
  "program": "MSEL",
  "program_name": "MS Early Ed",
  "term_code": "2026-T1",
  "term_desc": "Spring 2026",
  "status_stage": "Enrolled",
  "enrollment_specialist_name": "Jennifer Lawson",
  "funding_type": "Federal",
  "program_start_date": "2026-04-15T04:00:00.000Z",
  "reserve_date": "2026-02-01T04:00:00.000Z",
  "census_date": "2026-04-25T04:00:00.000Z",
  "time_to_program_start_days": 9,
  "time_since_reserve_days": 63,
  "last_updated_at": "2026-04-05T22:48:53.425Z",
  "readinessLevel": "Medium",
  "engagementLevel": "Medium",
  "isGeneratingAi": false,
  "syncTimestamp": 1775500472437
}
```

### Subcollection — `personalized_checklists/fafsa_submission`

```json
{
  "is_satisfied": true,
  "updated_at": "2026-03-15T10:00:00.000Z"
}
```

### Subcollection — `student_activity_logs/evt_001`

```json
{
  "log_id": "evt_001",
  "student_id": "A00302996",
  "term_code": "2026-T1",
  "activity_category": "task_history",
  "activity_name": "phone_call",
  "activity_datetime": "2026-02-10T14:30:00.000Z",
  "actor": "enrollment_specialist",
  "source_system": "Salesforce",
  "communication_type": "Phone",
  "task_notes": "Welcome call completed. Student confirmed attendance.",
  "task_comments": "Student excited, no concerns raised.",
  "task_status": "Completed",
  "last_updated_timestamp": "2026-02-10T14:35:00.000Z"
}
```

### Subcollection — `ai_outputs/latest`

```json
{
  "overviewSummary": "Amy is enrolled in MS Early Ed starting April 15th with 9 days remaining. Federal funding is in place but onboarding checklist completion is unconfirmed. Proactive outreach is recommended before program start.",
  "readinessRisk": {
    "level": "Medium",
    "trendDirection": "stable",
    "trendNote": "No checklist activity recorded in the last 7 days."
  },
  "engagementRisk": {
    "level": "Medium",
    "trendDirection": "stable",
    "trendNote": "Last contact was a phone call on Feb 10. No recent inbound activity."
  },
  "metrics": {
    "timeSinceReserve": "63 days",
    "timeToProgramStart": "9 days",
    "timeToCensus": "20 days"
  },
  "nextBestActions": [
    {
      "title": "Confirm Federal Financial Aid Status",
      "urgent": true,
      "points": [
        "Verify the student's federal financial aid package is finalized and scheduled for disbursement.",
        "Confirm there are no outstanding holds preventing disbursement."
      ],
      "buttonText": "Review Requirement"
    },
    {
      "title": "Initiate Proactive Outreach to Student",
      "urgent": false,
      "points": [
        "Contact the student to offer support and confirm readiness for program start.",
        "Reinforce important dates and available resources."
      ],
      "buttonText": "Complete Task >"
    }
  ],
  "emailDraft": {
    "bodyText": "We're so excited to welcome you to the MS Early Ed program at Covista University! With your program starting on April 15th, Jennifer Lawson and the entire team are here to ensure you have a smooth transition.",
    "bullets": [
      "Confirm your financial aid disbursement status in your student portal.",
      "Review the orientation schedule and materials available online."
    ]
  },
  "smsDraft": "Hi Amy! Just 9 days until your MS Early Ed program starts at Covista! So excited for you. Let us know if you need anything!",
  "agentTrace": [
    {
      "agentName": "Student Success Agent",
      "action": "Generate Core Risk Profile",
      "status": "Success",
      "duration": "1.2s",
      "timestamp": "2026-04-06T18:35:00.000Z"
    },
    {
      "agentName": "Communications Agent",
      "action": "Synthesize Custom Outreach",
      "status": "Success",
      "duration": "2.1s",
      "timestamp": "2026-04-06T18:35:02.100Z"
    }
  ],
  "generatedAt": "2026-04-06T18:35:02.708835Z"
}
```
