# Covista AI: BigQuery Data Contract (v6 - Architecture Aligned)

## 1. Architecture Alignment Update

Based on recent discussions, the following updates have been applied:

- BigQuery is positioned as source of truth only
- Firestore is the operational store for UI consumption
- Data ingestion follows: BigQuery → Pub/Sub → Firestore
- Activity data unified into a single activity_log
- Task history, contingencies, and cases consolidated into activity_log
- Readiness and engagement risk marked as optional/derived
- AI is not in the core data path (invoked from UI)

---

## 2. Boundary of Responsibilities

### Data Engineering Team
- Deliver structured datasets into BigQuery
- No Firestore logic
- No UI or AI transformations

### Application Team
- Ingest data via Pub/Sub into Firestore
- Compute readiness, engagement, accreditation
- Handle UI rendering and AI interactions

---

## 3. Data Flow

Salesforce / SIS  
→ BigQuery  
→ Pub/Sub  
→ Firestore  
→ Angular App  
↔ Vertex AI  

---

## 4. Tables

### 4.1 r2c_student_profile

```sql
CREATE TABLE `r2c_student_profile` (
    student_id STRING NOT NULL,
    student_name STRING,
    institution STRING,
    program STRING,
    program_name STRING,
    term_code STRING,
    status_stage STRING,
    program_start_date DATE,
    reserve_date DATE,
    census_date DATE,
    funding_type STRING,
    last_updated_at TIMESTAMP
);
```

---

### 4.2 r2c_student_activity_log (Unified Event Ledger)

```sql
CREATE TABLE `r2c_student_activity_log` (
    student_id STRING NOT NULL,
    term_code STRING NOT NULL,

    activity_name STRING NOT NULL,
    activity_datetime TIMESTAMP NOT NULL,

    activity_category STRING,
    communication_type STRING,

    original_state STRING,
    new_state STRING,

    actor STRING,
    source_system STRING,
    creation_date DATE,

    course_level STRING,

    other_info STRING
);
```

---

## 5. Activity Dictionary

### student_event
- initial_portal_login
- fafsa_submission
- alternate_funding
- first_course_registration
- wwow_login
- logged_into_course
- discussion_board_submission

### advisor_task
- phone_call
- email
- text
- chat
- file_review

### contingency
- contingency

### system_event
- reserved
- wwow_access_granted

---

## 6. Business Rules

- Accreditation is determined in the application layer using course_level
- Contingencies are treated generically
- Task history is captured via activity_log using communication_type
- No joins expected downstream (Firestore consumption)

---

## 7. Optional Derived Datasets

- r2c_student_readiness (optional)
- r2c_engagement_risk (optional)

These can be computed in the application layer or downstream services.

---

## 8. Summary

- BigQuery = source
- Firestore = operational store
- activity_log = unified event model
- App layer = computation + AI
