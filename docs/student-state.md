# Student State Model — Firestore Architecture (v1, April 2026)

> **Source of truth** for the shape of a student record in the operational Firestore store.  
> Schema contract: [`docs/student-state-schema.json`](./student-state-schema.json)  
> BQ source: `covista_demo` — `r2c_student_profile` + `r2c_student_activity_log` (v17.5)

---

## Architecture Overview

```
BigQuery (r2c_student_profile / r2c_student_activity_log)
        │
        │  Cloud Scheduler → /sync-bq-to-firestore  (ingestion pipeline)
        ▼
Firestore: salesforce_opportunities/{student_id}          ← root doc (lightweight)
        ├── /personalized_checklists/{checklist_id}       ← one doc per checklist item
        ├── /student_activity_logs/{log_id}               ← raw event ledger
        └── /ai_outputs/latest                            ← heavy AI payload
                │
                │  Firestore trigger: syncAiInsightsOnUpdate (isGeneratingAi → true)
                ▼
        Python AI Agent (Cloud Run — Vertex AI / Gemini 2.5 Flash)
                │
                │  writes results back to ai_outputs/latest
                │  copies readinessLevel + engagementLevel → root doc
                ▼
        Angular UI
        ├── Dashboard list-view  → reads ROOT doc only (fast)
        └── Student detail-view  → additionally loads subcollections + ai_outputs/latest
```

---

## Root Document Fields

`salesforce_opportunities/{student_id}`

### Profile (from BQ `r2c_student_profile`)

| Field | Type | Description |
|---|---|---|
| `student_id` | string | Salesforce Opportunity ID. Firestore document ID. |
| `student_name` | string | Full legal name. |
| `institution` | string | Institution code. |
| `program` | string | Program code (e.g. `MSN-NP`). |
| `program_name` | string | Human-readable program name. |
| `term_code` | string | Academic term code. |
| `term_desc` | string | Term description. |
| `status_stage` | string | Enrollment lifecycle stage. |
| `enrollment_specialist_name` | string | Assigned ES. |
| `program_start_date` | date \| null | ISO date of first class day. |
| `reserve_date` | date \| null | ISO date student reserved their seat. |
| `census_date` | date \| null | ISO date of census cutoff. |
| `funding_type` | string | FAFSA / employer / self-pay. |

### Timing (derived)

| Field | Type | Description |
|---|---|---|
| `time_to_program_start_days` | number \| null | Days until program_start_date. |
| `time_since_reserve_days` | number \| null | Days since reserve_date. |

### Requirements Summary (maintained by `aggregateChecklistsOnUpdate` CF)

| Field | Type | Description |
|---|---|---|
| `requirements.orientationStarted` | boolean | Portal login completed. |
| `requirements.wwowOrientationStarted` | boolean | WWOW orientation started. |
| `requirements.courseRegistration` | boolean | Student is registered. |
| `requirements.firstAssignmentSubmitted` | boolean | First assignment posted. |
| `requirements.assignmentByCensusDay` | boolean | Assignment before census. |
| `requirements.fafsaSubmitted` | boolean | FAFSA submitted. |
| `requirements.fundingPlan` | boolean | Funding plan approved. |
| `requirements.officialTranscriptsReceived` | boolean | TRF on file. |
| `requirements.nursingLicenseReceived` | boolean | Nursing license on file. |

### AI Summary Fields (root — for dashboard filtering only)

| Field | Type | Description | Owner |
|---|---|---|---|
| `readinessLevel` | "High" \| "Medium" \| "Low" \| null | Copy of AI readiness risk. Dashboard filter key. | `syncAiInsightsOnUpdate` CF |
| `engagementLevel` | "High" \| "Medium" \| "Low" \| null | Copy of AI engagement risk. Dashboard filter key. | `syncAiInsightsOnUpdate` CF |

### System / Orchestration Fields

| Field | Type | Description | Owner |
|---|---|---|---|
| `isGeneratingAi` | boolean | **Signal field.** Set `true` by UI to trigger AI recompute. CF sets `false` when done. | UI (write) / CF (clear) |
| `lastAiError` | string \| null | Last pipeline error. Null on success. | CF |
| `syncTimestamp` | number \| null | Unix ms timestamp of last BQ→Firestore sync. Recursion guard. | Ingestion pipeline |
| `lastUpdatedByPipelineAt` | ISO datetime \| null | Timestamp of last BQ ingestion commit. | Ingestion pipeline |

---

## Subcollection: `personalized_checklists`

Path: `salesforce_opportunities/{student_id}/personalized_checklists/{checklist_id}`

Written by ingestion pipeline. Aggregated by `aggregateChecklistsOnUpdate` Cloud Function into root `requirements`.

| Field | Type | Description |
|---|---|---|
| `checklist_id` | string | Key (e.g. `fafsa_submission`, `initial_portal_login`). |
| `student_id` | string | Parent student ID. |
| `item_name` | string | Human-readable label. |
| `category` | string | Funding / Orientation / Contingency / Academic. |
| `is_satisfied` | boolean | Completion flag. |
| `due_date` | date \| null | Target completion date. |
| `completed_at` | datetime \| null | Actual completion time. |
| `source` | string | BQ field or rule that drives this item. |

**Known checklist IDs:**

| checklist_id | Maps to `requirements.*` | Category |
|---|---|---|
| `initial_portal_login` | `orientationStarted` | Orientation |
| `wwow_login` | `wwowOrientationStarted` | Orientation |
| `course_registration` | `courseRegistration` | Academic |
| `logged_into_course` | `firstAssignmentSubmitted` | Academic |
| `class_participation` | `assignmentByCensusDay` | Academic |
| `fafsa_submission` | `fafsaSubmitted` + `fundingPlan` | Funding |
| `contingencies` | `officialTranscriptsReceived` + `nursingLicenseReceived` | Contingency |

---

## Subcollection: `student_activity_logs`

Path: `salesforce_opportunities/{student_id}/student_activity_logs/{log_id}`

Raw event ledger from `r2c_student_activity_log`. Append-only. Read by AI agent for context. **Do not mutate existing documents.**

| Field | Type | Description |
|---|---|---|
| `log_id` | string | Unique event ID (BQ `log_id`). |
| `student_id` | string | Parent student ID. |
| `term_code` | string | Academic term. |
| `activity_category` | string | See Activity Dictionary below. |
| `activity_name` | string | Specific event name. |
| `activity_datetime` | datetime \| null | When event occurred. |
| `communication_type` | Phone/Email/Text/Chat/File Review \| null | Channel used. |
| `task_notes` | string \| null | ES notes. |
| `task_comments` | string \| null | Additional comments. |
| `interaction_direction` | inbound/outbound \| null | Direction of contact. |
| `case_number` | string \| null | Salesforce case number. |
| `case_status` | string \| null | open/in_progress/pending/resolved/closed. |

### Activity Dictionary

| activity_category | activity_name examples | Description |
|---|---|---|
| `Enrollment` | `seat_reserved`, `enrollment_status_change`, `program_start_confirmed` | Enrollment lifecycle milestones. |
| `Financial Aid` | `fafsa_submitted`, `fafsa_approved`, `funding_plan_set`, `award_letter_sent` | Financial aid events. |
| `Academic` | `portal_login`, `wwow_started`, `course_registered`, `first_discussion_post`, `assignment_submitted` | Academic activity inside the LMS. |
| `Engagement` | `email_sent`, `email_opened`, `email_clicked`, `sms_sent`, `sms_clicked`, `call_attempt`, `call_connected` | Outreach channel events. |
| `SystemEvent` | `ai_generated`, `sync_completed`, `checklist_aggregated` | Internal pipeline events. |

---

## Subcollection: `ai_outputs`

Path: `salesforce_opportunities/{student_id}/ai_outputs/latest`

**Single document named `latest`.** Written exclusively by the Python AI agent (Cloud Run). Loaded **only** on the Student Detail page — never fetched for the dashboard list view.

| Field | Type | Description |
|---|---|---|
| `generatedAt` | ISO datetime | When this AI payload was generated. |
| `overviewSummary` | string | 3-4 sentence holistic narrative for the ES. |
| `readinessRisk.level` | High/Medium/Low | Current readiness risk level. |
| `readinessRisk.trendDirection` | up/down/stable | Trajectory over last 7 days. |
| `readinessRisk.trendNote` | string | Supporting note. |
| `engagementRisk.level` | High/Medium/Low | Current engagement risk level. |
| `engagementRisk.trendDirection` | up/down/stable | Trajectory. |
| `engagementRisk.trendNote` | string | Supporting note. |
| `metrics.timeSinceReserve` | string | e.g. "5 days" |
| `metrics.timeToProgramStart` | string | e.g. "14 days" |
| `metrics.timeToCensus` | string | e.g. "21 days" |
| `nextBestActions` | array | Array of NBA items (title, urgent, points[], buttonText). |
| `emailDraft.subject` | string | AI-generated email subject. |
| `emailDraft.bodyText` | string | AI-generated email body. |
| `emailDraft.bullets` | string[] | Actionable bullets to paste in. |
| `smsDraft` | string | AI-generated SMS under 140 chars. |
| `agentTrace` | array | Pipeline trace for transparency (agentName, action, status, duration, timestamp). |

---

## AI Generation Flow

```
1. UI sets  isGeneratingAi = true  on root doc
          (via StudentService.triggerAiGeneration)

2. Cloud Function syncAiInsightsOnUpdate fires
   Guard:  before.isGeneratingAi !== true  &&  after.isGeneratingAi === true
   → calls Python Agent /generate-insights (POST)

3. Python Agent:
   a. Reads root doc + student_activity_logs + personalized_checklists for context
   b. Calls Vertex AI (Gemini 2.5 Flash) — core insights (sync) + comms (background thread)
   c. Writes  ai_outputs/latest  subcollection document
   d. Returns lightweight summary to Cloud Function

4. Cloud Function:
   a. Writes  readinessLevel + engagementLevel  to root doc
   b. Writes  aiInsights  (backward-compat) to root doc
   c. Sets    isGeneratingAi = false
   d. Clears  lastAiError

5. UI snapshot listener detects  isGeneratingAi === false
   → loads  ai_outputs/latest  for detail view
   → updates dashboard root card from root fields
```

---

## Ownership Matrix

| System | Owns these fields |
|---|---|
| **Ingestion Pipeline** (BQ → Firestore) | `student_name`, `institution`, `program`, `term_*`, `status_stage`, `program_start_date`, `reserve_date`, `census_date`, `funding_type`, `lastUpdatedByPipelineAt`, all `personalized_checklists/*`, all `student_activity_logs/*` |
| **Cloud Functions** | `requirements`, `readinessLevel`, `engagementLevel`, `isGeneratingAi`, `lastAiError`, `syncTimestamp` |
| **Python AI Agent** | `ai_outputs/latest` |
| **Angular UI** | `isGeneratingAi` (write `true` only to trigger) |

---

## Example: Root Document

```json
{
  "student_id": "OPP-001-2026-MSN",
  "student_name": "Jordan Rivera",
  "institution": "WALU",
  "program": "MSN-NP",
  "program_name": "Master of Science in Nursing — Nurse Practitioner",
  "term_code": "2026SP",
  "term_desc": "Spring 2026",
  "status_stage": "Enrolled",
  "enrollment_specialist_name": "Priya Mehta",
  "program_start_date": "2026-05-01",
  "reserve_date": "2026-02-14",
  "census_date": "2026-05-22",
  "funding_type": "FAFSA",
  "time_to_program_start_days": 18,
  "time_since_reserve_days": 58,
  "requirements": {
    "orientationStarted": true,
    "wwowOrientationStarted": true,
    "courseRegistration": true,
    "firstAssignmentSubmitted": false,
    "assignmentByCensusDay": false,
    "fafsaSubmitted": true,
    "fundingPlan": false,
    "officialTranscriptsReceived": false,
    "nursingLicenseReceived": true
  },
  "readinessLevel": "Medium",
  "engagementLevel": "High",
  "isGeneratingAi": false,
  "lastAiError": null,
  "syncTimestamp": 1744571200000,
  "lastUpdatedByPipelineAt": "2026-04-13T09:15:00Z"
}
```

## Example: `personalized_checklists/fafsa_submission`

```json
{
  "checklist_id": "fafsa_submission",
  "student_id": "OPP-001-2026-MSN",
  "item_name": "FAFSA Submission",
  "category": "Funding",
  "is_satisfied": true,
  "due_date": "2026-04-01",
  "completed_at": "2026-03-28T14:22:00Z",
  "source": "r2c_student_profile.funding_plan_status"
}
```

## Example: `student_activity_logs/evt-0042`

```json
{
  "log_id": "evt-0042",
  "student_id": "OPP-001-2026-MSN",
  "term_code": "2026SP",
  "activity_category": "Engagement",
  "activity_name": "email_opened",
  "activity_datetime": "2026-04-10T11:04:00Z",
  "communication_type": "Email",
  "interaction_direction": "inbound",
  "task_notes": null,
  "task_comments": null,
  "case_number": null,
  "case_status": null
}
```

## Example: `ai_outputs/latest`

```json
{
  "generatedAt": "2026-04-13T09:20:15Z",
  "overviewSummary": "Jordan is tracking well for May 1 start. FAFSA submitted but award letter still pending — funding risk is moderate. Transcript contingency remains open. Engagement is strong: email opened within 2 hours of last outreach.",
  "readinessRisk": { "level": "Medium", "trendDirection": "stable", "trendNote": "Transcript contingency unresolved for 12 days." },
  "engagementRisk": { "level": "Low", "trendDirection": "down", "trendNote": "Email opened within 2 hours on Apr 10." },
  "metrics": { "timeSinceReserve": "58 days", "timeToProgramStart": "18 days", "timeToCensus": "39 days" },
  "nextBestActions": [
    {
      "title": "Funding — FAFSA Submitted, Awaiting Award",
      "urgent": true,
      "points": [
        "Check FAFSA status: https://studentaid.gov/help/check-fafsa-status",
        "Confirm student portal shows award letter status",
        "FAFSA process can take several business days"
      ],
      "buttonText": "Review Requirement"
    }
  ],
  "emailDraft": {
    "subject": "Quick update on your enrollment — action needed",
    "bodyText": "Your FAFSA has been received and is under review. To keep your May 1 start on track, your official transcripts still need to be submitted.",
    "bullets": [
      "Submit official transcripts from your previous institution",
      "Check your student portal for your financial aid status"
    ]
  },
  "smsDraft": "Hi Jordan! Quick reminder: your official transcript is still needed before May 1. Reply HELP or call us anytime.",
  "agentTrace": [
    { "agentName": "Student Success Agent", "action": "Generate Core Risk Profile", "status": "Success", "duration": "1420ms", "timestamp": "2026-04-13T09:20:10Z" },
    { "agentName": "Communications Agent", "action": "Synthesize Custom Outreach (Detached)", "status": "Success", "duration": "3850ms", "timestamp": "2026-04-13T09:20:14Z" }
  ]
}
```
