# Data Contract: R2C Prototype – BigQuery Data Warehouse

**Version:** 1.0
**Status:** Draft – Pending PM Review
**Owner:** Data Engineering / R2C Project Team
**Stakeholder:** Bryan
**Last Updated:** 2026-03-30
**Reference Epic:** R2C (Reserve to Census) Prototype

---

## 1. Overview

This data contract defines the structure, sources, field definitions, business rules, and quality expectations for the dataset powering the **R2C (Reserve to Census) AI prototype** for Walden University students. The dataset is hosted in **GCP BigQuery** and serves as the primary input to the R2C AI interface for readiness risk scoring, engagement risk scoring, and personalised communication recommendations.

### 1.1 Purpose

- Deliver a **future-looking dataset** (with future census dates) for a defined cohort of Walden Reserve students
- Support **readiness risk** scoring based on checklist completion status
- Support **engagement risk** scoring based on periods of inactivity after Reserve
- Enable **personalised communication** via the R2C AI interface

### 1.2 In Scope

- Defining and finalising the tabular data contract (fields, structure, definitions)
- Extracting and preparing data from GCP BigQuery for selected R2C students
- Generating a future-looking dataset including future census dates
- Supporting data-related discrepancies

### 1.3 Out of Scope

- Data points outside the confirmed R2C prototype scope
- Social, WhatsApp, auto-dialer communication types (Salesforce)
- Non-accredited course data

---

## 2. Dataset Summary

| Table Name                    | Description                                                | Primary Source                             |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `r2c_student_profile`         | Core student identity and programme data                   | Banner                                     |
| `r2c_student_readiness`       | Checklist item status, risk classification, and timestamps | Banner, Salesforce, Canvas, Student Portal |
| `r2c_student_activity_log`    | Full event log of student activities across all systems    | Banner, Salesforce, Canvas, Student Portal |
| `r2c_engagement_risk`         | Derived engagement risk scores based on activity gaps      | Derived                                    |
| `r2c_salesforce_task_history` | Salesforce task/communication history for each student     | Salesforce                                 |
| `r2c_salesforce_cases`        | Open and closed case data for backend workflow tracking    | Salesforce                                 |
| `r2c_contingencies`           | IAR-derived contingency requirements per student           | Salesforce (IAR)                           |

---

## 3. Table Definitions

---

### 3.1 `r2c_student_profile`

Core student identity and programme enrolment data. One row per student per term.

| Field Name                   | Data Type | Nullable | Source System | Description                                              |
| ---------------------------- | --------- | -------- | ------------- | -------------------------------------------------------- |
| `student_id`                 | STRING    | NO       | Banner        | Unique student identifier                                |
| `institution`                | STRING    | NO       | Banner        | Institution name                                         |
| `student_name`               | STRING    | YES      | Banner        | Student full name                                        |
| `program`                    | STRING    | NO       | Banner        | Programme code                                           |
| `program_name`               | STRING    | NO       | Banner        | Programme full name                                      |
| `term_code`                  | STRING    | NO       | Banner        | Academic term code (e.g. 202510)                         |
| `term_desc`                  | STRING    | YES      | Banner        | Human-readable term description                          |
| `status_stage`               | STRING    | NO       | Banner        | Current student stage (e.g. Reserved, Enrolled, Dropped) |
| `program_start_date`         | DATE      | NO       | Banner        | Official programme start date                            |
| `reserve_date`               | DATE      | NO       | Banner        | Date student entered Reserve status                      |
| `census_date`                | DATE      | NO       | Banner        | Day 10 census milestone date (future-looking)            |
| `time_to_program_start_days` | INTEGER   | YES      | Derived       | Days until programme start from record snapshot date     |
| `time_since_reserve_days`    | INTEGER   | YES      | Derived       | Days since Reserve date at snapshot time                 |

**Business Rules:**

- `census_date` must be calculated as `program_start_date + 10 days` where not explicitly provided by Banner
- Only students with `status_stage = 'Reserved'` at snapshot time are in scope for the prototype
- `program_start_date` must be a future date at initial dataset generation

---

### 3.2 `r2c_student_readiness`

One row per student per checklist item. Captures readiness status, risk level, and key timestamps for each item in the personalised checklist.

| Field Name             | Data Type | Nullable | Source System | Description                                              |
| ---------------------- | --------- | -------- | ------------- | -------------------------------------------------------- |
| `student_id`           | STRING    | NO       | Banner        | Unique student identifier                                |
| `term_code`            | STRING    | NO       | Banner        | Academic term code                                       |
| `checklist_item`       | STRING    | NO       | Derived       | Checklist item name (see Checklist Item Reference below) |
| `item_type`            | STRING    | NO       | Derived       | `checklist` or `checklist_per_contingency`               |
| `is_checked_off`       | BOOLEAN   | NO       | Various       | Whether the checklist item condition is met              |
| `checked_off_ts`       | TIMESTAMP | YES      | Various       | Timestamp when item was first satisfied                  |
| `readiness_risk`       | STRING    | NO       | Derived       | `Low`, `Medium`, `High`, or `Happy Path`                 |
| `personalization_flag` | BOOLEAN   | YES      | Derived       | Whether item applies conditional personalisation logic   |
| `personalization_note` | STRING    | YES      | Derived       | Description of personalisation condition if applicable   |
| `snapshot_date`        | DATE      | NO       | Derived       | Date this readiness row was calculated                   |

**Checklist Item Reference:**

| `checklist_item` Value           | Source System              | Checked Off Condition                                                                 |
| -------------------------------- | -------------------------- | ------------------------------------------------------------------------------------- |
| `initial_portal_login`           | Student Portal             | Student has logged in at least once                                                   |
| `fafsa_submission`               | Financial Aid / Salesforce | Student has submitted FAFSA (only if no alternate funding source selected)            |
| `course_registration`            | Banner                     | Student is currently registered to at least one accredited course                     |
| `wwow_login`                     | Canvas (WWOW)              | Student has logged into WWOW at least once                                            |
| `contingency_{institution_name}` | Salesforce (IAR)           | CONT. checkbox is selected in Documents Verified in IAR; one row per open contingency |
| `logged_into_course`             | Canvas                     | Student has logged into at least one accredited course                                |
| `class_participation_day10`      | Canvas                     | Student has submitted a discussion board post in at least one accredited course       |

**Readiness Risk Classification Rules:**

| Checklist Item              | Low Risk                               | Medium Risk                                                           | High Risk                                                                       | Happy Path                           |
| --------------------------- | -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------ |
| `initial_portal_login`      | Not logged in, 3 days since Reserve    | Not logged in, 5 days since Reserve                                   | Not logged in, 7+ days since Reserve                                            | Logged in within 24 hours of Reserve |
| `fafsa_submission`          | 3–4 weeks before programme start       | 2–3 weeks before programme start                                      | < 2 weeks before programme start                                                | 4+ weeks before programme start      |
| `course_registration`       | Not registered, 7–30 days before start | Not registered, 4–7 days before start                                 | Not registered < 4 days before start OR not registered to any accredited course | Auto-registered                      |
| `wwow_login`                | Not logged in within 1 week of access  | Not logged in 4+ weeks after access                                   | N/A                                                                             | Logged in upon access                |
| `contingency_{n}`           | Waiting 2 weeks – 1 month before start | Waiting < 2 weeks; TRF on file                                        | Waiting < 2 weeks; no TRF; 4–5+ contingencies pending                           | Cleared before programme start       |
| `logged_into_course`        | Not logged in 1+ day after start       | Not logged in 2+ days after start (late reserve, awaiting access)     | Not logged in 3+ days after start (late reserve, awaiting access)               | Logged in on Day 1                   |
| `class_participation_day10` | Not participated 1+ day after start    | Not participated 2+ days after start (participated before start date) | Not participated 3+ days after start (late reserve, awaiting access)            | Participated on Day 1                |

**Business Rules:**

- `fafsa_submission` item must be excluded if the student has selected an alternate funding source; `personalization_flag = TRUE` and `personalization_note` must document this
- `course_registration` should not act as a blocker for surfacing additional suggested actions when a student-initiated drop (reason code `DD`) is detected
- For `course_registration`, if drop reason code is `DD`, communications must include a CTA to connect with an Enrollment Specialist (ES)
- `logged_into_course` and `class_participation_day10` logic must be agnostic to specific course — student must have logged in/participated in at least one accredited (credit-bearing) course
- `contingency_{institution_name}` — only IAR records where `CONT.` checkbox is selected are in scope; institution name must be captured as part of the item name

---

### 3.3 `r2c_student_activity_log`

Full event log of student activity across all connected systems. One row per activity event per student.

| Field Name          | Data Type | Nullable | Source System | Description                                                   |
| ------------------- | --------- | -------- | ------------- | ------------------------------------------------------------- |
| `student_id`        | STRING    | NO       | Banner        | Unique student identifier                                     |
| `term_code`         | STRING    | NO       | Banner        | Academic term code                                            |
| `activity_name`     | STRING    | NO       | Various       | Standardised activity name (see Activity Name Reference)      |
| `activity_datetime` | TIMESTAMP | NO       | Various       | Timestamp of the activity event                               |
| `original_state`    | STRING    | YES      | Various       | State before the activity (if applicable)                     |
| `new_state`         | STRING    | YES      | Various       | State after the activity (if applicable)                      |
| `actor`             | STRING    | YES      | Various       | Who performed the action (student, system, staff)             |
| `source_system`     | STRING    | NO       | Various       | Source system (see System Reference)                          |
| `creation_date`     | DATE      | NO       | Various       | Date the record was created in the source system              |
| `other_info`        | STRING    | YES      | Various       | Additional context (e.g. TRF form on file, pending documents) |

**Activity Name Reference:**

| `activity_name` Value             | `source_system` |
| --------------------------------- | --------------- |
| `initial_portal_login`            | Student Portal  |
| `fafsa_submission`                | Salesforce      |
| `self_funding_selected`           | Salesforce      |
| `first_course_registration`       | Banner          |
| `wwow_orientation_login`          | Canvas          |
| `official_transcript_contingency` | Salesforce      |
| `logged_into_course`              | Canvas (LMS)    |
| `discussion_board_submission`     | Canvas          |
| `engagement_activity`             | Various         |
| `reserved`                        | Banner          |
| `wwow_access_granted`             | Canvas          |

**System Reference:**

| `source_system` Value | Description                                       |
| --------------------- | ------------------------------------------------- |
| `Student Portal`      | Walden student portal (account login / setup)     |
| `Salesforce`          | CRM — funding, contingencies, task history, cases |
| `Banner`              | Student Information System — registration, terms  |
| `Canvas`              | LMS — course login, orientation, assignments      |
| `Derived`             | Calculated field, not sourced directly            |

---

### 3.4 `r2c_engagement_risk`

Derived engagement risk score per student, calculated based on recency of any recorded activity after Reserve date.

| Field Name               | Data Type | Nullable | Source System | Description                                        |
| ------------------------ | --------- | -------- | ------------- | -------------------------------------------------- |
| `student_id`             | STRING    | NO       | Derived       | Unique student identifier                          |
| `term_code`              | STRING    | NO       | Derived       | Academic term code                                 |
| `snapshot_date`          | DATE      | NO       | Derived       | Date this risk was calculated                      |
| `last_activity_ts`       | TIMESTAMP | YES      | Derived       | Timestamp of most recent recorded activity         |
| `activity_gap_days`      | INTEGER   | YES      | Derived       | Days since last recorded activity at snapshot date |
| `weeks_to_program_start` | INTEGER   | YES      | Derived       | Weeks remaining until programme start              |
| `engagement_risk`        | STRING    | NO       | Derived       | `Low`, `Medium`, or `High`                         |

**Engagement Risk Classification Rules:**

| Weeks to Programme Start | Low Risk                             | Medium Risk                      | High Risk                         |
| ------------------------ | ------------------------------------ | -------------------------------- | --------------------------------- |
| < 4 weeks                | Signs of activity within last 3 days | No activity for more than 3 days | No activity for more than 7 days  |
| 4+ weeks                 | Signs of activity within last 5 days | No activity for more than 5 days | No activity for more than 10 days |

**Business Rules:**

- "Activity" is defined as any event recorded in `r2c_student_activity_log`
- Late Reserve students who are waiting to gain classroom access or registration should have engagement risk noted separately to avoid false-positive high risk scoring

---

### 3.5 `r2c_salesforce_task_history`

Salesforce task history records for in-scope communication types. One row per task per student.

| Field Name           | Data Type | Nullable | Source System | Description                                                       |
| -------------------- | --------- | -------- | ------------- | ----------------------------------------------------------------- |
| `student_id`         | STRING    | NO       | Salesforce    | Unique student identifier                                         |
| `term_code`          | STRING    | NO       | Banner        | Academic term code                                                |
| `task_id`            | STRING    | NO       | Salesforce    | Unique Salesforce task identifier                                 |
| `communication_type` | STRING    | NO       | Salesforce    | Type of communication (see allowed values below)                  |
| `task_subject`       | STRING    | YES      | Salesforce    | Task subject line                                                 |
| `task_description`   | STRING    | YES      | Salesforce    | Task body / notes                                                 |
| `task_datetime`      | TIMESTAMP | NO       | Salesforce    | Date and time task was created                                    |
| `task_status`        | STRING    | YES      | Salesforce    | Status of the task                                                |
| `actor_name`         | STRING    | YES      | Salesforce    | Name of the Enrollment Specialist or system that created the task |
| `direction`          | STRING    | YES      | Salesforce    | `Inbound` or `Outbound`                                           |

**Allowed `communication_type` Values:**

| Value            | Included in Scope |
| ---------------- | ----------------- |
| `Phone Call`     | YES               |
| `Email`          | YES               |
| `Text`           | YES               |
| `Chat`           | YES               |
| `File Review`    | YES               |
| `Auto Dialer`    | NO                |
| `Social`         | NO                |
| `WhatsApp`       | NO                |
| `Financial Plan` | NO                |

**Functional Expectations:**

- Task history must provide a complete engagement timeline to support AI-driven suggested actions
- Must be used to avoid duplicate or repetitive communication
- Must provide quick context for Enrollment Specialists
- Must support personalisation of outbound messaging

---

### 3.6 `r2c_salesforce_cases`

Salesforce case records tracking backend workflows not visible in task history. One row per case per student.

| Field Name           | Data Type | Nullable | Source System | Description                                        |
| -------------------- | --------- | -------- | ------------- | -------------------------------------------------- |
| `student_id`         | STRING    | NO       | Salesforce    | Unique student identifier                          |
| `term_code`          | STRING    | NO       | Banner        | Academic term code                                 |
| `case_number`        | STRING    | NO       | Salesforce    | Unique Salesforce case number                      |
| `subject`            | STRING    | YES      | Salesforce    | Case subject                                       |
| `case_record_type`   | STRING    | NO       | Salesforce    | Record type of the case                            |
| `case_type`          | STRING    | NO       | Salesforce    | High-level case type (see Case Type Reference)     |
| `case_subtype`       | STRING    | YES      | Salesforce    | Case subtype (see Case Type Reference)             |
| `case_status`        | STRING    | NO       | Salesforce    | Current status of the case (all statuses required) |
| `case_closed_reason` | STRING    | YES      | Salesforce    | Closed reason formula field                        |
| `datetime_opened`    | TIMESTAMP | NO       | Salesforce    | Date and time the case was opened                  |
| `datetime_closed`    | TIMESTAMP | YES      | Salesforce    | Date and time the case was closed (null if open)   |
| `case_comments`      | STRING    | YES      | Salesforce    | Free-text case comments                            |
| `is_pending`         | BOOLEAN   | NO       | Derived       | `TRUE` if case is open and awaiting action         |
| `is_in_progress`     | BOOLEAN   | NO       | Derived       | `TRUE` if case is actively being worked            |
| `is_completed`       | BOOLEAN   | NO       | Derived       | `TRUE` if case has been closed/resolved            |

**Case Type Reference (In Scope):**

| `case_type`    | `case_subtype`                               |
| -------------- | -------------------------------------------- |
| CCT            | Login Credentials                            |
| Student Portal | Course Registration Help – Add Course        |
| Student Portal | Course Registration Help – Drop Course       |
| Student Portal | Transcript Request Inquiry (TRF)             |
| Student Portal | Student Issue                                |
| Student Portal | Portal Issues                                |
| Student Portal | University Credentials Missing / Not Created |

**Functional Expectations:**

- Must track status and progress of key processes such as transcript requests
- Must identify whether a case is Pending, In Progress, or Completed via derived boolean fields

---

### 3.7 `r2c_contingencies`

IAR-derived contingency requirements per student. One row per open contingency per student.

| Field Name                 | Data Type | Nullable | Source System    | Description                                                         |
| -------------------------- | --------- | -------- | ---------------- | ------------------------------------------------------------------- |
| `student_id`               | STRING    | NO       | Salesforce (IAR) | Unique student identifier                                           |
| `term_code`                | STRING    | NO       | Banner           | Academic term code                                                  |
| `contingency_id`           | STRING    | NO       | Salesforce (IAR) | Unique identifier for the IAR contingency record                    |
| `institution_name`         | STRING    | NO       | Salesforce (IAR) | Name of the institution associated with the contingency             |
| `cont_checkbox_selected`   | BOOLEAN   | NO       | Salesforce (IAR) | Whether the CONT. checkbox is selected in Documents Verified in IAR |
| `trf_form_on_file`         | BOOLEAN   | YES      | Salesforce       | Whether a Transcript Request Form (TRF) has been submitted          |
| `contingency_status`       | STRING    | NO       | Salesforce (IAR) | Current status of the contingency                                   |
| `contingency_cleared_date` | DATE      | YES      | Salesforce (IAR) | Date contingency was cleared (null if still open)                   |
| `is_cleared`               | BOOLEAN   | NO       | Derived          | `TRUE` if `contingency_cleared_date` is not null                    |

**Business Rules:**

- Only records where `cont_checkbox_selected = TRUE` are in scope for the prototype
- The associated `institution_name` must be captured; records without an institution name should be flagged as data quality issues
- FAFSA submission status may have a 1–2 day processing delay (via PowerFAIDS); downstream logic must account for this where contingency overlaps with financial data

---

## 4. Primary Readiness Input Schema (AI Interface)

This is the denormalised, flattened schema delivered to the AI interface. One row per student per term.

```sql
-- BigQuery Table: r2c_ai_input_flat
student_id                  STRING      -- Banner: Unique student identifier
term_code                   STRING      -- Banner: Academic term
institution                 STRING      -- Banner: Institution name
program_start_date          DATE        -- Banner: Official programme start date
census_date                 DATE        -- Derived: program_start_date + 10 days
time_to_program_start_days  INTEGER     -- Derived: Days until programme start
time_since_reserve_days     INTEGER     -- Derived: Days since Reserve date
status_stage                STRING      -- Banner: Current student stage

-- Readiness Checklist Flags
first_portal_login_ts        TIMESTAMP  -- Student Portal: First successful login timestamp
fafsa_submitted_flag         BOOLEAN    -- Financial Aid/Salesforce: FAFSA submitted indicator
fafsa_submitted_ts           TIMESTAMP  -- Financial Aid/Salesforce: FAFSA submission timestamp
alternate_funding_flag       BOOLEAN    -- Salesforce: Alternate funding source selected
registration_status          STRING     -- Banner: Registered / Not Registered
orientation_started_flag     BOOLEAN    -- Canvas (WWOW): Orientation started indicator
orientation_started_ts       TIMESTAMP  -- Canvas (WWOW): Orientation start timestamp
first_lms_login_ts           TIMESTAMP  -- Canvas: First course login timestamp
first_assignment_ts          TIMESTAMP  -- Canvas: First assignment submission timestamp
submitted_by_day10_flag      BOOLEAN    -- Canvas: Submitted at least one assignment by Day 10
contingency_count_open       INTEGER    -- Salesforce (IAR): Number of open contingencies
contingency_count_trf_on_file INTEGER   -- Salesforce: Contingencies with TRF on file

-- Engagement & Risk
last_contact_ts              TIMESTAMP  -- Salesforce: Last inbound or outbound contact timestamp
activity_gap_days            INTEGER    -- Derived: Days since last recorded activity
readiness_risk               STRING     -- Derived: Low / Medium / High (worst checklist item)
engagement_risk              STRING     -- Derived: Low / Medium / High
```

---

## 5. Data Quality Rules

| Rule ID | Table                         | Field                    | Rule Description                                                                         | Severity |
| ------- | ----------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- | -------- |
| DQ-001  | `r2c_student_profile`         | `program_start_date`     | Must be a future date at initial dataset generation                                      | CRITICAL |
| DQ-002  | `r2c_student_profile`         | `status_stage`           | Must be `Reserved` at point of inclusion                                                 | CRITICAL |
| DQ-003  | `r2c_student_readiness`       | `checklist_item`         | Must only contain values from the Checklist Item Reference                               | HIGH     |
| DQ-004  | `r2c_student_readiness`       | `readiness_risk`         | Must be one of: `Low`, `Medium`, `High`, `Happy Path`                                    | HIGH     |
| DQ-005  | `r2c_contingencies`           | `cont_checkbox_selected` | Only `TRUE` records should be included; filter applied at extraction                     | CRITICAL |
| DQ-006  | `r2c_contingencies`           | `institution_name`       | Must not be null; flag records missing institution name                                  | HIGH     |
| DQ-007  | `r2c_salesforce_task_history` | `communication_type`     | Must only include in-scope types; out-of-scope types filtered at extraction              | HIGH     |
| DQ-008  | `r2c_salesforce_cases`        | `case_type`              | Must only include in-scope case types from Case Type Reference                           | HIGH     |
| DQ-009  | `r2c_student_activity_log`    | `activity_datetime`      | Must not be null; records with null timestamps to be flagged                             | MEDIUM   |
| DQ-010  | `r2c_ai_input_flat`           | `fafsa_submitted_flag`   | Must be `NULL` (not `FALSE`) where `alternate_funding_flag = TRUE`                       | HIGH     |
| DQ-011  | `r2c_student_readiness`       | `course_registration`    | Only accredited courses to be considered; non-accredited courses excluded from all logic | CRITICAL |

---

## 6. Known Data Gaps & Items for PM Review (Bryan)

The following items require confirmation before the dataset can be considered complete:

| Gap ID  | Area                  | Description                                                                                                                                         | Status                                  |
| ------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| GAP-001 | FAFSA                 | 1–2 day processing delay via PowerFAIDS means submission status may lag in Salesforce. Downstream risk logic must handle this tolerance window.     | Needs PM sign-off on tolerance approach |
| GAP-002 | Course Registration   | Drop reason code `DD` logic requires Banner to surface drop reason code in the extract. Confirm field availability.                                 | Needs Banner team confirmation          |
| GAP-003 | Engagement Activity   | Definition of "Engagement Activity" (activity_name = `engagement_activity`) not fully specified. Requires agreement on what system events qualify.  | Needs business definition               |
| GAP-004 | Late Reserve Students | Students who are late reserves and waiting for classroom access/registration need a flag to prevent false-positive High engagement risk. Logic TBC. | Needs PM + data team sign-off           |
| GAP-005 | WWOW Access           | `wwow_access_granted` event must be available to calculate engagement gap correctly. Confirm Canvas provides this event in the extract.             | Needs Canvas team confirmation          |
| GAP-006 | Census Date           | Confirm whether census date is sourced directly from Banner or must always be derived as `program_start_date + 10`.                                 | Needs Banner team confirmation          |
| GAP-007 | Contingencies         | TRF form on file indicator — confirm whether this is available directly in Salesforce IAR or requires a separate case lookup.                       | Needs Salesforce team confirmation      |

---

## 7. Communication Patterns Supported by This Dataset

The following communication patterns are enabled by this data contract and must be supportable from the fields defined above:

| Pattern                                           | Readiness Risk | Engagement Risk | Required Fields                                                     |
| ------------------------------------------------- | -------------- | --------------- | ------------------------------------------------------------------- |
| Recovery After Missed Momentum                    | Low / Medium   | Medium          | `last_contact_ts`, `readiness_risk`, `activity_gap_days`            |
| Overwhelmed Reserve                               | High           | Low             | `contingency_count_open`, `readiness_risk`, `checklist_item` counts |
| Reserve-Initiated Momentum                        | N/A            | N/A             | `first_portal_login_ts`, `orientation_started_ts`                   |
| Missing 1 High Risk Checklist Item                | High           | N/A             | `readiness_risk`, `checklist_item`, `time_to_program_start_days`    |
| Missing Multiple High Risk Checklist Items        | High           | N/A             | All readiness fields                                                |
| Missing Multiple High Risk Items – Start < 7 Days | High           | N/A             | `time_to_program_start_days`, all readiness fields                  |

---

## 8. Ownership & Sign-Off

| Role                  | Name            | Responsibility                                         |
| --------------------- | --------------- | ------------------------------------------------------ |
| Product Manager       | Bryan           | Scope confirmation, gap resolution, prototype approval |
| Data Engineering Lead | TBC             | BigQuery extraction, transformation, schema delivery   |
| Data Contract Owner   | TBC             | Maintaining this document                              |
| Business Stakeholder  | Walden R2C Team | Business rule validation                               |

---

## 9. Change Log

| Version | Date       | Author        | Changes                                                     |
| ------- | ---------- | ------------- | ----------------------------------------------------------- |
| 1.0     | 2026-03-30 | R2C Data Team | Initial draft based on ADO epic and supporting spreadsheets |

---

_This data contract is a living document. All changes must be reviewed by the PM and Data Engineering Lead before implementation._
