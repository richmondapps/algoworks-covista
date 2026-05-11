# Covista AI: BigQuery Data Contract (V18.1)

## 1. Architecture Alignment

BigQuery is the source of truth only. All operational consumption flows:

Salesforce / SIS → BigQuery → Pub/Sub → Firestore → Angular App ↔ Vertex AI

Key Principles:
- No filtering in BigQuery (raw ingestion only)
- Firestore is the operational store
- Application layer handles filtering, logic, and AI
- No joins required downstream (unified event model)

---

## 2. Tables

### 2.1 r2c_student_profile

```sql
CREATE TABLE `r2c_student_profile` (
    student_id STRING NOT NULL,
    student_name STRING,
    institution STRING,
    program STRING,
    program_name STRING,
    term_code STRING,
    term_desc STRING,
    status_stage STRING,
    enrollment_specialist_name STRING,

    program_start_date DATE,
    reserve_date DATE,
    census_date DATE,
    funding_type STRING,

    time_to_program_start_days INT64,
    time_since_reserve_days INT64,

    last_updated_at TIMESTAMP
);
```

---

### 2.2 r2c_student_activity_log (Unified Event Ledger)

```sql
CREATE TABLE `r2c_student_activity_log` (
    log_id STRING NOT NULL,
    student_id STRING NOT NULL,
    term_code STRING NOT NULL,

    activity_category STRING,
    activity_name STRING,
    activity_datetime TIMESTAMP,

    -- Task Fields
    communication_type STRING,
    task_notes STRING,
    task_comments STRING,
    task_status STRING,

    -- Case Fields
    case_number STRING,
    case_subject STRING,
    case_record_type STRING,
    case_type STRING,
    case_subtype STRING,
    case_status STRING,
    case_closed_reason STRING,
    case_closed_datetime TIMESTAMP,
    case_created_date DATE,
    case_comments STRING,
    contact_id STRING,           -- Salesforce mapping (case-level; moved from profile in V18.1)
    opportunity_id STRING,       -- Salesforce mapping (case-level; moved from profile in V18.1)
    opportunity_owner_id STRING, -- Salesforce mapping (case-level; moved from profile in V18.1)

    -- Source Tracking
    source_system STRING,
    last_updated_timestamp TIMESTAMP,

    -- Course Context
    course_identification STRING,
    course_level STRING,
    course_status STRING,
    is_accredited BOOLEAN,

    -- Contingency Fields
    contingency_requirement STRING,
    contingency_institution_name STRING,
    contingency_status STRING,

    -- FAFSA Fields (intent)
    fafsa_interest_in_federal_aid BOOLEAN,
    fafsa_intend_to_fund STRING,

    -- FAFSA Fields (submission)
    fafsa_submission_flag BOOLEAN
);
```

---

## 3. Activity Dictionary

| activity_category | activity_name |
|---|---|
| student_event | initial_portal_login |
| student_event | fafsa_submission |
| student_event | alternate_funding_submission |
| student_event | first_course_registration |
| student_event | wwow_login |
| student_event | logged_into_course |
| student_event | lms_login |
| student_event | discussion_board_submission |
| student_event | course_drop (DD) |
| task_history | phone_call |
| task_history | email |
| task_history | text |
| task_history | chat |
| task_history | file_review |
| case | case_opened |
| case | case_updated |
| case | case_closed |
| contingency | contingency |
| system_event | reserved |

---

## 4. Task History Requirements

- Must capture BOTH communication type AND content
- task_notes and task_comments are separate and both required
- task_status must be captured

### 4.1 Task Time Coverage

activity_datetime <= census_date

---

## 5. Case Handling

### 5.1 Case Status Values

- open
- in_progress
- pending
- resolved
- closed

### 5.2 Case Lifecycle Tracking

- case_created_date
- case_closed_datetime

### 5.3 Case Time Coverage

case_created_date <= census_date

### 5.4 Case Type / Subtype Taxonomy

| case_type | case_subtype |
|---|---|
| CCT | Login Credentials |
| CCT | Student Portal |
| Course Registration Help | Add Course |
| Course Registration Help | Drop Course |
| Course Registration Help | Transcript Request Inquiry (TRF) |
| Student Issue | Portal Issues |
| Student Issue | University Credentials Missing/Not Created |

### 5.5 Case Processing Rules

- Each update = new event row
- case_status reflects latest state

---

## 6. Contingency Handling

Fields:
- contingency_requirement STRING
- contingency_institution_name STRING
- contingency_status STRING

Rules:
- Represents contingency requirements tied to student lifecycle
- One row per contingency event
- activity_category = "contingency"
- activity_name = "contingency"

---

## 7. Actor Logic

- `actor` column is not part of the contract.
- Task-history rows implicitly represent an Enrollment Specialist action; student-event rows implicitly represent a student action. No explicit actor attribution is stored.

---

## 8. Course Accreditation

- Stored in BigQuery as `is_accredited`
- Derived during ingestion using course metadata (e.g., course_level)
- Used directly by downstream applications and AI

---

## 9. Incremental Processing

- last_updated_timestamp used for incremental ingestion

---

## 10. Data Limitations

- FAFSA submission has no timestamp; `activity_datetime` is NULL for `activity_name = 'fafsa_submission'`. Completion is driven by `fafsa_submission_flag` (see §11).
- Alternate funding submission has no timestamp; `activity_datetime` is NULL for `activity_name = 'alternate_funding_submission'`. Completion is derived from `fafsa_interest_in_federal_aid` (see §11).
- Access-granted dates are not collected upstream. No date is emitted for access provided to student for the student portal, WWOW orientation, or the course. Consumers rely on engagement proxies (e.g., `wwow_login`, `logged_into_course`, `lms_login`).
- `initial_portal_login` has no source data. Student-portal login events live as logs in the portal application's own GCP project, not in Salesforce / DaaS. Ingestion pending GCP access; no ETA. Until then, the `initial_portal_login` checklist line renders as "unknown / not satisfied" in the UI.
- `lms_login` source availability is pending confirmation from the SIS / LMS team. Until the feed is wired, engagement for post-orientation activity is derived from `wwow_login` + `logged_into_course` only.
- `application_submission_date` may be used as a proxy for program-start-date-adjacent calculations (pending business confirmation).

---

## 11. FAFSA + Alternate Funding Semantics

The funding picture is split into intent, path selection, and submission action:

| Field | Meaning | Drives |
|---|---|---|
| `fafsa_interest_in_federal_aid` (BOOL) | Student expressed intent to use federal aid | Path selection: FAFSA vs Alternate Funding (see §11.1) |
| `fafsa_intend_to_fund` (STRING; `;`-joined) | Funding mix the student plans to use (e.g., `Financial Aid;Scholarship`, `Military/VA Benefits`, `Out of Pocket`) | Context for AI prompt + UI funding summary |
| `fafsa_submission_flag` (BOOL) | Student has submitted the FAFSA application. Populated by Salesforce (`source_system = 'Salesforce'`). | FAFSA checklist completion |

There is no `fafsa_submission_date`. `activity_datetime` for `activity_name IN ('fafsa_submission', 'alternate_funding_submission')` is NULL by design. Consumers use `last_updated_timestamp` as the fallback ordering key.

Two `activity_name` values exist under this umbrella:

- `fafsa_submission` — emitted when `fafsa_interest_in_federal_aid = TRUE`
- `alternate_funding_submission` — emitted when `fafsa_interest_in_federal_aid IS NULL` OR `fafsa_interest_in_federal_aid = FALSE`

### 11.1 Consumer Rules

1. Path selection (mutually exclusive per student):
   - `fafsa_interest_in_federal_aid = TRUE` → FAFSA path: show the FAFSA checklist line.
   - `fafsa_interest_in_federal_aid IS NULL` OR `= FALSE` → Alternate Funding path: show the Alternate Funding checklist line; the FAFSA line is not shown.
2. FAFSA checklist completion: Mark FAFSA complete when `fafsa_submission_flag = TRUE`.
3. Alternate Funding checklist completion: Auto-satisfied — being on the Alternate Funding path is the completion signal. No separate submission tracking is required.
4. Blank handling: When `fafsa_intend_to_fund IS NULL` AND `fafsa_interest_in_federal_aid IS NULL`, treat the student as on the Alternate Funding path by default (per rule 1).
5. Multiple FAFSA events per student: De-duplicate by latest `last_updated_timestamp`.
6. FAFSA denial / re-submission workflow is out of scope; V18.1 tracks only the binary "submitted."

---

## 12. Reserve Date + Reserved-Status Scope

### 12.1 Source Scope

`r2c_student_profile` is filtered at the source query to `status = 'Reserved'` students only. As a consequence, `reserve_date` only appears for Reserved students.

### 12.2 Future Extension

When the dashboard expands beyond Reserved students, source will add a `latest_status_decision_date` column on `r2c_student_profile` plus a case statement per status so that each lifecycle date is surfaced under the correct semantic name (reserve_date for Reserved, denied_date for Denied, etc.). Until then, `reserve_date` remains Reserved-only.

### 12.3 Consumer Backstop

If a non-Reserved row ever leaks through, consumers MUST:

- Suppress `reserve_date` and `time_since_reserve_days` in the UI when `status_stage != 'Reserved'`.
- Omit both fields from the AI agent prompt context for the same case.

---

## 13. LMS Engagement Semantics

### 13.1 Scope

`lms_login` is an additive engagement event. It captures every time a student accesses the LMS after the initial orientation / course-login milestones, enabling a rolling view of whether the student is actively engaged with the university's systems.

### 13.2 Granularity

- One row per LMS access event (full history, not first-only).
- `activity_category = 'student_event'`, `activity_name = 'lms_login'`.
- `activity_datetime` is populated with the LMS access timestamp.
- No per-course attribution is stored. Discussion-board posts, specific course page visits, and quiz submissions are explicitly out of scope.

### 13.3 Relationship to Existing Events

- Does not replace `wwow_login` (milestone: first WoW access) or `logged_into_course` (milestone: first course access). Those remain first-occurrence-only for the readiness checklist.
- `lms_login` is the only `student_event` activity_name that may repeat for a given student.

### 13.4 Consumer Rules

1. Engagement window: consumers compute engagement level over a rolling window (default 14 days) by counting `lms_login` rows alongside `task_history` activity.
2. Engagement tiers (reference — implemented in the Firestore event-layer spec):
   - HIGH — any `lms_login` or strong signal within the last 24h
   - MEDIUM — activity within the last 3–7 days
   - LOW — no qualifying activity in >7 days
3. `lms_login` counts as a student-originated signal; it does not satisfy any readiness checklist line on its own.
4. When the `lms_login` feed is not yet wired, engagement falls back to `wwow_login` + `logged_into_course` + task-history activity.

### 13.5 Source Dependency

`lms_login` availability from the LMS / SIS source is pending confirmation. The contract reserves the slot; ingestion begins once the source feed is confirmed.

---

## 14. Summary — Changes from V17.9 → V18.1

| Change | Section |
|---|---|
| Moved `contact_id`, `opportunity_id`, `opportunity_owner_id` from `r2c_student_profile` to `r2c_student_activity_log` under Case Fields — these are case-level attributes (one student → many cases → potentially different owners), not student-level | 2.1, 2.2 |
| Rationale: Salesforce case ownership varies per case; storing on the profile would collapse history. Confirmed by Sumi (Data Process Implementation sync, 5/11) and Manvitha (R2C planning channel, 5/11 12:33 PM) | 2.2 |

---

## 15. Summary — Changes from V17.8 → V17.9

| Change | Section |
|---|---|
| Added `lms_login` to Activity Dictionary under `student_event` | 3 |
| New §13 "LMS Engagement Semantics" — additive engagement event, full history, no per-course attribution, does not replace `wwow_login` / `logged_into_course` milestones | 13 |
| §10 Data Limitations extended — `lms_login` source availability pending; `wwow_login` + `logged_into_course` remain the engagement fallback until wired | 10 |
| Engagement tiering reference (HIGH / MEDIUM / LOW) aligned to `docs/EVENT_LAYER_SPEC.md` | 13.4 |
