import os
from google.cloud import bigquery

project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "algoworks-dev")
dataset_id = "covista_demo"
client = bigquery.Client(project=project_id)

ddl_statements = [
    f"""
    CREATE OR REPLACE TABLE `{project_id}.{dataset_id}.student_core` (
        student_id STRING NOT NULL,
        full_name STRING,
        institution_code STRING,
        program_code STRING,
        program_start_date DATE,
        reserve_date DATE,
        trf_form_on_file BOOLEAN,
        enrollment_status STRING,
        funding_plan_status STRING,
        wwow_orientation_started_at TIMESTAMP,
        etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    );
    """,
    f"""
    CREATE OR REPLACE TABLE `{project_id}.{dataset_id}.student_contingencies` (
        contingency_id STRING NOT NULL,
        student_id STRING NOT NULL,
        institution_name STRING,
        contingency_type STRING,
        contingency_status STRING,
        etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    );
    """,
    f"""
    CREATE OR REPLACE TABLE `{project_id}.{dataset_id}.student_courses` (
        enrollment_id STRING NOT NULL,
        student_id STRING NOT NULL,
        course_id STRING NOT NULL,
        is_accredited BOOLEAN,
        course_registration_status STRING,
        first_login_at TIMESTAMP,
        first_discussion_post_at TIMESTAMP,
        etl_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    );
    """
]

seed_statements = [
    # Seed Core Data
    f"""
    INSERT INTO `{project_id}.{dataset_id}.student_core` 
    (student_id, full_name, institution_code, program_code, program_start_date, reserve_date, trf_form_on_file, enrollment_status, funding_plan_status, wwow_orientation_started_at)
    VALUES 
    ('A00302996', 'Collins, Amy', 'WLDN', 'MSN_BSN_NONP', '2023-02-27', '2023-02-17', FALSE, 'Reserved', 'Pending', NULL),
    ('A00409782', 'Woods, Barbara', 'WLDN', 'MPA', '2022-10-10', '2022-09-20', TRUE, 'Reserved', 'Complete', '2022-10-01 10:00:00 UTC'),
    ('A00437050', 'Catour, Angela', 'WLDN', 'BS_NURS_AIM', '2023-10-09', '2023-10-01', FALSE, 'Reserved', 'Pending', NULL);
    """,
    # Seed Contingencies
    f"""
    INSERT INTO `{project_id}.{dataset_id}.student_contingencies` 
    (contingency_id, student_id, institution_name, contingency_type, contingency_status)
    VALUES 
    ('CONT_001', 'A00302996', 'Virginia College', 'Official Transcript', 'PENDING'),
    ('CONT_002', 'A00302996', 'State Board', 'Nursing License', 'CLEARED'),
    ('CONT_003', 'A00437050', 'Previous University', 'Official Transcript', 'PENDING');
    """,
    # Seed Courses
    f"""
    INSERT INTO `{project_id}.{dataset_id}.student_courses` 
    (enrollment_id, student_id, course_id, is_accredited, course_registration_status, first_login_at, first_discussion_post_at)
    VALUES 
    ('ENR_001', 'A00302996', 'NURS101', TRUE, 'Registered', NULL, NULL),
    ('ENR_002', 'A00409782', 'PUBADMIN200', TRUE, 'Registered', '2022-10-11 10:00:00 UTC', '2022-10-12 15:00:00 UTC'),
    ('ENR_003', 'A00437050', 'NURS101', TRUE, 'Registered', NULL, NULL),
    ('ENR_004', 'A00302996', 'NURS102', FALSE, 'Not Registered', NULL, NULL);
    """
]

def run_queries(queries):
    for q in queries:
        try:
            job = client.query(q)
            job.result()  # Wait for the job to complete
            print(f"Successfully executed query:\n{q.strip()[:60]}...")
        except Exception as e:
            print(f"Error executing query: {e}")

if __name__ == "__main__":
    print("Creating DDL Schemas...")
    run_queries(ddl_statements)
    print("\\nSeeding Mock Data...")
    run_queries(seed_statements)
    print("\\nDatabase seeded successfully!")
