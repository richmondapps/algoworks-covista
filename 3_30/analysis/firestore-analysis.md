# Covista AI: Firestore State Analysis
### Date: 2026-03-31

---

## 1. Full Data Flow (from Arch1.png)

```
Client BigQuery (Enterprise Source)
        |
        v
Pub/Sub Topic (Event Stream)
        |
        v
Cloud Functions / Dataflow Pipeline
        |
        v
Transform + Data Contract
        |
        v
Firestore (Operational DB)  <-------> Angular App (ES UI via WebSockets)
        |                                       |
        v                               User-Initiated Requests
BigQuery - Analytics                            |
        |                                       v
        v                           Vertex AI / Gemini AI Assistant
Reporting / Dashboards
```

BigQuery is the source of truth. Firestore is the operational read layer for the Angular UI. Vertex AI is decoupled — only triggered by the ES on demand.

---

## 2. What Is Currently in Firestore

### Collection: `students`

> Note: The Firestore Data Contract specifies collection `student_records` but the Angular app reads from `students`. These do not match — this is a live gap.

Each document is keyed by a student UID string. Full shape:

```
students/{studentId}
  id                    string       Student UID
  uid                   string       Firebase-format UID
  name                  string       Student full name
  email                 string       Contact email
  phone                 string       Contact phone
  programDesc           string       Programme description
  termDesc              string       Term description
  enrollmentSpecialist  string       Assigned ES name
  programStartDate      ISO string   Programme start
  reserveDate           ISO string   Reserve date
  censusDate            ISO string   Day 10 milestone

  timeSinceReserveDays  number       Computed — days since reserve
  timeUntilClassStartDays number     Computed — days until start
  engagementLevel       High|Medium|Low    Computed risk level
  riskIndicator         High|Medium|Low    Computed readiness risk
  actionRequired        boolean      Computed — used as Pub/Sub-style filter

  checklist             ChecklistItem[]
    - id                string
    - name              string       "Official Transcripts" / "Financial Aid Documents" / "WWOW (Log in)"
    - status            Complete | Pending | Missing
    - dueDate           ISO string

  recommendedActions    RecommendedAction[]
    - id, title, description
    - priority          High | Medium | Low
    - type              Email | SMS | Call | Review

  stats                 StudentStats
    - emailsSent, emailOpens
    - smsSent, smsClicks
    - bestMethod        Email | SMS
    - lastSentAt, lastOpenedAt, avgOpenDelayMinutes

  aiInsights?           AiInsights (optional — generated on demand)
    - overview.intro, highlight, outro
    - riskSignals       (timeSinceReserve, engagementLevel, etc.)
    - nextBestActions[]
    - emailDraft, smsDraft
    - agentTrace[]

  notes?                StudentNote[]
    - text, timestamp, author

  communications?       CommunicationLog[]
    - type              Email | SMS
    - status            Sent | Delivered | Opened | Clicked | Failed
    - timestamp, body, agentName
```

---

## 3. How the Angular App Reads It

- `StudentService` opens a **realtime `onSnapshot` listener** on the `students` collection on app load
- All student documents land in an Angular signal: `students = signal<Student[]>([])`
- Components subscribe to this signal — no HTTP requests, no manual refresh needed
- If the collection is empty, the service writes 5 hardcoded dummy students via `writeBatch`

### Pub/Sub Simulation (Trigger Action Check)
```
triggerActionCheck()
  --> query students WHERE actionRequired == true
  --> ORDER BY timeUntilClassStartDays ASC
  --> set signal with filtered result
```
This mimics what a real Pub/Sub trigger would do — surfaces only students needing attention, ordered by urgency.

### Vertex AI Integration
```
generateAiInsights(student)
  --> Cloud Function: generateStudentInsights
  --> passes { studentUid, dataContext: student }
  --> returns aiInsights object
  --> app writes it back to student doc via setDoc({ merge: true })
```

### Document Query (RAG pattern)
```
queryDocumentInfo(studentUid, fileName, query)
  --> Cloud Function: queryStudentDocument
  --> passes file name + natural language query
  --> returns AI-generated answer from document content
```

---

## 4. Gaps Found — Current State vs V7 Contract

| # | Area | Current State | V7 Contract | Impact |
|---|---|---|---|---|
| G1 | Collection name | App reads `students` | Contract specifies `student_records` | DE pushes to wrong collection |
| G2 | Checklist structure | Array of objects with `{id, name, status, dueDate}` — hardcoded 3 items | Driven from `activity_name` events in activity_log | App checklist is static, not event-sourced |
| G3 | Requirements as booleans | Old contract uses flat `requirements: { fafsaSubmitted: bool, ... }` | V7 derives all from activity events | Incompatible schemas |
| G4 | Computed fields stored | `timeSinceReserveDays`, `engagementLevel`, `riskIndicator` stored as fields | V7: compute in app layer from raw data | Creates stale risk scores if not refreshed |
| G5 | `actionRequired` boolean | Pre-computed and stored in Firestore | V7: derived dynamically from readiness/engagement state | Can drift from actual student state |
| G6 | `activity_category` missing | No category concept — flat checklist only | V7: `student_event / advisor_task / contingency / system_event` | App cannot distinguish event types |
| G7 | `log_id` / deduplication | No deduplication field on activity events | V7: UUID `log_id` required for idempotent Pub/Sub delivery | Duplicate events possible |
| G8 | Course activity | `courseActivity[]` array with `firstLoginAt`, `lastAttendAt` | V7: `logged_into_course`, `discussion_board_submission` events in activity_log | Different shape — needs migration |
| G9 | `isAccredited` flag | Computed at DE layer, stored as boolean per course | V7: DE passes raw `course_level`, app evaluates `isAccredited` | Responsibility is misassigned |
| G10 | Advisor outreach log | `communications[]` stored in student doc | V7: `advisor_outreach` rows in activity_log with `communication_type` | Duplication — two sources of truth |

---

## 5. What Needs to Happen to Align with V7

### DE Team
1. Rename push target from `student_records` to `students` (or align the contract to `students`)
2. Stop flattening `requirements` into booleans — push raw event rows to `r2c_student_activity_log`
3. Pass `course_level` as raw string — do not evaluate `isAccredited`
4. Generate `log_id` UUID per activity event
5. Include `activity_category` and `activity_name` per V7 Section 4 dictionary
6. Push `advisor_outreach` rows into activity_log (not a separate CRM export)

### App Team
1. Update `StudentService` to read from the agreed collection name
2. Rebuild checklist derivation — compute from incoming activity events, not from stored booleans
3. Move `timeSinceReserveDays`, `timeUntilClassStartDays`, `engagementLevel`, `riskIndicator` to computed properties — do not store in Firestore
4. Evaluate `isAccredited` in app layer using `course_level` raw value
5. Remove `communications[]` from student doc — read advisor outreach from activity_log instead
6. Update `Student` model to reflect V7 schema

---

## 6. What Is Working Correctly

- Realtime `onSnapshot` listener — correct pattern for Firestore + Angular
- `setDoc({ merge: true })` pattern — correct for partial updates
- AI insights as on-demand generation via Cloud Functions — decoupled correctly per arch
- Pub/Sub simulation via `actionRequired` filter — correct concept, just needs dynamic derivation
- `writeBatch` for bulk dummy data init — correct Firestore pattern
- Document RAG via Cloud Function — correct pattern

---

## 7. Firestore Collection Map (Current)

```
students/                         <-- main collection
  {studentId}/                    <-- one doc per student
    [core fields]
    checklist[]
    recommendedActions[]
    stats{}
    aiInsights{}                  <-- written on demand
    notes[]
    communications[]
```

### Target Collection Map (V7 Architecture)

```
students/                         <-- profile collection (from r2c_student_profile)
  {studentId}/                    <-- one doc per student, core fields only

activity_log/                     <-- event ledger (from r2c_student_activity_log)
  {log_id}/                       <-- one doc per event, keyed by UUID
    student_id
    term_code
    activity_category
    activity_name
    activity_datetime
    communication_type
    source_system
    ...
```

App computes checklist state, risk levels, and engagement scores by querying `activity_log` for a given `student_id` — no pre-computed booleans stored.

---

_Analysis based on: Arch1.png, Firestore Data Contract.md, student.service.ts, student.ts model, BigQuery Data Contract V5/V7_
