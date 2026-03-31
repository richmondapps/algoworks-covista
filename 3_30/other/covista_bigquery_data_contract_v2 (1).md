# Covista AI: BigQuery Data Contract (Revised - v2 Aligned)

## 🔄 CHANGE LOG (Based on Latest Discussions)
1. Added Task History support (communication_type)
2. Updated Contingency naming (removed hardcoding like transcript/nursing)
3. Clarified Accreditation logic (handled by app, not DE)
4. Added Funding Type clarification (FAFSA vs Alternative)
5. Confirmed ingestion via Pub/Sub (no direct Firestore mapping)

---

## Boundary of Responsibilities
1. Data Engineering (DE) Team: Responsible ONLY for delivering datasets into BigQuery. No Firestore logic.
2. App Engineering Team: Handles Pub/Sub ingestion, Firestore, UI logic, AI, and calculations.

Data Flow:
Salesforce/SIS → BigQuery → Pub/Sub → Firestore → Angular App ↔ Vertex AI

---

## Table 1: covista_student_core

```sql
CREATE TABLE `project.covista_dataset.student_core` (
    student_id STRING NOT NULL,
    student_name STRING,
    institution STRING,
    program STRING,
    program_desc STRING,
    term STRING,
    term_desc STRING,
    status STRING,
    enrollment_specialist_name STRING,
    program_start_date TIMESTAMP,
    reserve_date TIMESTAMP,
    census_date TIMESTAMP,
    fafsa_application_received STRING,
    course_registration_status STRING,
    transcript_status STRING,
    nursing_license_status STRING,
    funding_type STRING,
    last_updated_at TIMESTAMP
)
PARTITION BY DATE(last_updated_at);
```

---

## Table 2: covista_student_activity_log

```sql
CREATE TABLE `project.covista_dataset.student_activity_log` (
    log_id STRING NOT NULL,
    student_id STRING NOT NULL,
    activity_name STRING NOT NULL,
    activity_datetime TIMESTAMP NOT NULL,
    original_state STRING,
    new_state STRING,
    communication_type STRING,
    actor STRING,
    system STRING,
    creation_date TIMESTAMP,
    course_identification STRING,
    course_level STRING,
    other_info STRING
);
```

---

## Activity Name Dictionary

1. Initial Portal Login
2. Funding - FAFSA Submission
3. Funding - Alternative
4. First Course Registration
5. WWOW Login
6. Contingency
7. Logged into course
8. Discussion Board Submission
9. Engagement Activity
10. Reserved
11. WWOW Access Granted

---

## Key Rules

- Accreditation handled in app (not DE)
- Contingencies are generic (no transcript/nursing hardcoding)
- Task history captured via communication_type
- BigQuery = Source of truth
- Firestore = Operational store
