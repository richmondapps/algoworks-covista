import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

with open('.adtalem_credentials.json','r',encoding='utf-8') as f:
    ci=json.load(f)
creds=Credentials(token=None,refresh_token=ci['refresh_token'],token_uri='https://oauth2.googleapis.com/token',client_id=ci['client_id'],client_secret=ci['client_secret'],quota_project_id='dev-wu-agenticai-app-proj')

client = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)

# Key fields to validate
key_fields = [
    'is_accredited', 'fafsa_interest_in_federal_aid', 'fafsa_intend_to_fund',
    'contingency_requirement', 'contingency_institution_name', 'contingency_status',
    'course_identification', 'course_level', 'course_status',
    'case_number', 'case_subject', 'case_status',
    'communication_type', 'task_status'
]

print("=== DATA QUALITY REPORT ===\n")
for field in key_fields:
    query = f"""
    SELECT
        COUNT(*) AS total_rows,
        COUNTIF({field} IS NULL) AS null_count,
        COUNTIF({field} IS NOT NULL) AS non_null_count,
        COUNT(DISTINCT {field}) AS distinct_values
    FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
    """
    result = list(client.query(query).result())[0]
    null_pct = (result.null_count / result.total_rows * 100) if result.total_rows > 0 else 0
    populated_pct = (result.non_null_count / result.total_rows * 100) if result.total_rows > 0 else 0
    
    status = "?" if result.non_null_count > 0 else "?"
    print(f"{status} {field}")
    print(f"  Total={result.total_rows:,} | Populated={result.non_null_count:,} ({populated_pct:.1f}%) | Distinct values={result.distinct_values}")
    
    # Get sample values for non-null field
    if result.non_null_count > 0:
        sample_q = f"SELECT DISTINCT {field} FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log` WHERE {field} IS NOT NULL LIMIT 5"
        samples = list(client.query(sample_q).result())
        if samples:
            sample_vals = [str(getattr(s, field)) for s in samples]
            print(f"  Sample values: {sample_vals[:3]}")
    print()
