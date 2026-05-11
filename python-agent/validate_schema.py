import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

with open('.adtalem_credentials.json','r',encoding='utf-8') as f:
    ci=json.load(f)
creds=Credentials(token=None,refresh_token=ci['refresh_token'],token_uri='https://oauth2.googleapis.com/token',client_id=ci['client_id'],client_secret=ci['client_secret'],quota_project_id='dev-wu-agenticai-app-proj')

client = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)

# Get actual schema
table = client.get_table('dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log')
print("=== ACTUAL SCHEMA IN BQ ===")
print(f"Total columns: {len(table.schema)}")
for field in table.schema:
    print(f"{field.name}|{field.field_type}|{field.mode}")

# Contract columns (for r2c_student_activity_log)
contract_cols = {
    'log_id': 'STRING', 'student_id': 'STRING', 'term_code': 'STRING',
    'activity_category': 'STRING', 'activity_name': 'STRING', 'activity_datetime': 'TIMESTAMP',
    'communication_type': 'STRING', 'task_notes': 'STRING', 'task_comments': 'STRING', 'task_status': 'STRING',
    'case_number': 'STRING', 'case_subject': 'STRING', 'case_record_type': 'STRING',
    'case_type': 'STRING', 'case_subtype': 'STRING', 'case_status': 'STRING',
    'case_closed_reason': 'STRING', 'case_closed_datetime': 'TIMESTAMP',
    'case_created_date': 'DATE', 'case_comments': 'STRING',
    'actor': 'STRING', 'source_system': 'STRING', 'last_updated_timestamp': 'TIMESTAMP',
    'course_identification': 'STRING', 'course_level': 'STRING', 'course_status': 'STRING', 'is_accredited': 'BOOLEAN',
    'contingency_requirement': 'STRING', 'contingency_institution_name': 'STRING', 'contingency_status': 'STRING',
    'fafsa_interest_in_federal_aid': 'BOOLEAN', 'fafsa_intend_to_fund': 'STRING'
}

actual_cols = {field.name: field.field_type for field in table.schema if field.name != '_mirrored_at'}

print("\n=== SCHEMA COMPARISON ===")
print("\nIn contract but MISSING in actual BQ:")
missing = set(contract_cols.keys()) - set(actual_cols.keys())
if missing:
    for col in sorted(missing):
        print(f"  {col}")
else:
    print("  (none - all contract columns present)")

print("\nIn actual BQ but NOT in contract:")
extra = set(actual_cols.keys()) - set(contract_cols.keys())
if extra:
    for col in sorted(extra):
        print(f"  {col}")
else:
    print("  (none - no extra columns)")

print("\nType mismatches (contract != actual):")
type_mismatches = []
for col in contract_cols:
    if col in actual_cols and actual_cols[col] != contract_cols[col]:
        type_mismatches.append((col, contract_cols[col], actual_cols[col]))

if type_mismatches:
    for col, contract_type, actual_type in type_mismatches:
        print(f"  {col}: contract={contract_type}, actual={actual_type}")
else:
    print("  (none - all types match)")
