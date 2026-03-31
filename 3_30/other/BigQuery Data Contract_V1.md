# Covista AI: BigQuery Data Contract (Revised)

This document outlines the strict boundary of responsibilities and the official BigQuery DDL schemas required for the Covista application.

### Boundary of Responsibilities
1. **Data Engineering (DE) Team:** Responsible **ONLY** for delivering the required dataset incrementally into the two BigQuery tables defined below. **No Firebase, no Firestore logic, and no API merges are required from DE.**
2. **Covista App Engineering Team:** Responsible for ingesting the BigQuery data into Firestore via Pub/Sub and executing all frontend UI translations, boolean evaluations (e.g., assessing if a transcript is "Cleared" to generate an Action), and risk/engagement calculations locally.

---

### Table 1: `covista_student_core`
This table holds the flat, singular state of the student. I have re-added the explicit source system columns to ensure 1:1 parity with your upstream data sources.

**Logic Note:** The DE team does **not** need to evaluate booleans (e.g. `officialTranscriptsReceived`); simply pass the raw status strings from Salesforce. The Covista App will handle the boolean math natively. Phone and Email merges are also omitted and will be handled out-of-scope by the Application team.

```sql
CREATE TABLE `project.covista_dataset.student_core` (
    student_id STRING NOT NULL,
    student_name STRING,
    
    -- Demographics & Program Structure
    institution STRING,
    program STRING,
    program_desc STRING,
    term STRING,
    term_desc STRING,
    status STRING,
    enrollment_specialist_name STRING,
    
    -- Crucial Baseline Metrics
    program_start_date TIMESTAMP,
    reserve_date TIMESTAMP,
    census_date TIMESTAMP,
    
    -- Raw Status Strings (Covista will evaluate "Cleared" vs "Pending" internally)
    fafsa_application_received STRING,
    course_registration_status STRING,
    transcript_status STRING,
    nursing_license_status STRING,

    -- System Metadata
    last_updated_at TIMESTAMP OPTIONS(description="Pipeline insertion timestamp")
)
PARTITION BY DATE(last_updated_at);
```

---

### Table 2: `covista_student_activity_log`
*(Replaces "Task History", "Engagement History", "Cases", and "Contingencies")*

The DE team does not need to build complex nested generic "Engagement" or "Contingency" structures. Instead, append a flat row to this ledger every time a student completes a milestone (e.g., FAFSA submission, Discussion Board Post) or a contingency flag changes state in Salesforce. 

The Covista App will automatically ingest this ledger to calculate engagement and risk.

```sql
CREATE TABLE `your-project.covista_dataset.student_activity_log` (
    log_id STRING NOT NULL OPTIONS(description="UUID for the log entry"),
    student_id STRING NOT NULL,
    
    -- Event Identifiers
    activity_name STRING NOT NULL OPTIONS(description="e.g., 'Initial Portal Login', 'WWOW Login', 'Class Participation', 'Contingency'"),
    activity_datetime TIMESTAMP NOT NULL,
    
    -- State Tracking (For Contingencies/Cases)
    original_state STRING,
    new_state STRING OPTIONS(description="e.g., 'checked', 'submitted', 'pending'"),
    
    -- Origin Tracking
    actor STRING OPTIONS(description="Who performed it (Student, ES Name)"),
    system STRING OPTIONS(description="e.g., 'Student Portal', 'Salesforce', 'Canvas', 'Banner'"),
    creation_date TIMESTAMP OPTIONS(description="System timestamp when row was cut"),
    
    -- Additional Context (e.g., Course Metadata)
    course_identification STRING OPTIONS(description="If applicable, the course ID"),
    course_level STRING OPTIONS(description="Used by Covista App to internally calculate isAccredited flag on the fly"),
    other_info STRING OPTIONS(description="Notes like 'pending document list with university'")
);
```

---

### Appendix A: Required `activity_name` Dictionary
To ensure the Covista App correctly maps Contingencies on the Checklist natively, the DE team **MUST** use the exact `activity_name` strings below whenever inserting a row into the `covista_student_activity_log`:

1. `Initial Portal Login`
2. `Funding - FAFSA Submission`
3. `Self Funding`
4. `First Course Registration`
5. `WWOW (Orientation) Login`
6. `Contingency`
7. `Logged into course`
8. `Discussion Board Submission`


If a row lands in the BigQuery log with any of these exact strings, the Covista App's Pub/Sub pipeline will automatically check it off the student's Checklist and calculate the precise `High/Medium/Low` Risk threshold dynamically!
