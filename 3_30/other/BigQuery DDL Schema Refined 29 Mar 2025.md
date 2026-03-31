# BigQuery Data Engineering Schema (DDL)

This document contains the exact Data Definition Language (DDL) required to build the foundational raw tables inside BigQuery, as well as the Aggregated View that translates those tables into our standardized boolean requirements payload.

---

## 1. `student_core`
*Holds strict 1-to-1 demographic data, funding milestones, and dates.*

```sql
CREATE OR REPLACE TABLE `project.covista_data.student_core` (
    student_id STRING NOT NULL,
    full_name STRING,
    institution_code STRING,
    program_code STRING,
    
    program_start_date TIMESTAMP,
    reserve_date TIMESTAMP,
    
    funding_plan_status STRING,
    wwow_orientation_started_at TIMESTAMP,
    
    etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

---

## 2. `student_courses`
*Holds 1-to-Many data for course progression. This enables us to distinguish Accredited vs Non-Accredited milestones.*

```sql
CREATE OR REPLACE TABLE `project.covista_data.student_courses` (
    enrollment_id STRING NOT NULL,
    student_id STRING NOT NULL,
    course_id STRING NOT NULL,
    
    course_registration_status STRING, -- e.g., 'Registered', 'Dropped'
    is_accredited BOOLEAN, -- (Accredited courses ONLY count towards requirements)
    
    first_login_at TIMESTAMP,
    first_discussion_post_at TIMESTAMP,
    
    etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

---

## 3. `student_contingencies`
*Holds 1-to-Many data for required documents and transcripts.*

```sql
CREATE OR REPLACE TABLE `project.covista_data.student_contingencies` (
    contingency_id STRING NOT NULL,
    student_id STRING NOT NULL,
    contingency_type STRING, -- (e.g., 'Official Transcript', 'Nursing License')
    contingency_status STRING, -- (e.g., 'PENDING', 'CLEARED')
    
    etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

---

## 4. The `student_requirements` Aggregated View
*Because students have multiple courses and multiple contingencies, the Data Engineering team needs to build an **Aggregated View** over the normalized tables above so our ETL sync isn't forced to query all rows. This calculates our exact boolean logic constraints perfectly behind the scenes before we pull.*

```sql
CREATE OR REPLACE VIEW `project.covista_data.student_requirements` AS
SELECT 
    core.student_id,
    
    -- Evaluated Core Facts
    IF(core.funding_plan_status = 'Complete', TRUE, FALSE) AS req_fundingPlan,
    IF(core.wwow_orientation_started_at IS NOT NULL, TRUE, FALSE) AS req_wwowOrientationStarted,
    
    -- Course Registration: TRUE if enrolled in at least one accredited course that hasn't been dropped
    IF(COUNTIF(courses.course_registration_status = 'Registered') > 0, TRUE, FALSE) AS req_courseRegistration,
    
    -- Orientation/Login: TRUE if ANY accredited course has a login timestamp
    IF(MAX(courses.first_login_at) IS NOT NULL, TRUE, FALSE) AS req_orientationStarted,
    
    -- Participation: TRUE if ANY accredited course has a discussion post
    IF(MAX(courses.first_discussion_post_at) IS NOT NULL, TRUE, FALSE) AS req_firstAssignmentSubmitted,
    
    -- Census Day Flag: TRUE if discussion post was submitted <= 10 days after program start
    IF(MAX(courses.first_discussion_post_at) <= TIMESTAMP_ADD(core.program_start_date, INTERVAL 10 DAY), TRUE, FALSE) AS req_assignmentByCensusDay,
    
    -- Official Transcripts / Contingencies: TRUE ONLY if EVERY required document is 'CLEARED'
    IF(LOGICAL_AND(contingencies.contingency_status = 'CLEARED'), TRUE, FALSE) AS req_officialTranscriptsReceived
    
FROM `student_core` AS core
LEFT JOIN `student_courses` AS courses 
    ON core.student_id = courses.student_id 
    AND courses.is_accredited = TRUE -- ONLY accredited courses apply to logic checks!
LEFT JOIN `student_contingencies` AS contingencies 
    ON core.student_id = contingencies.student_id
GROUP BY 
    core.student_id, 
    core.funding_plan_status, 
    core.wwow_orientation_started_at,
    core.program_start_date;
```

