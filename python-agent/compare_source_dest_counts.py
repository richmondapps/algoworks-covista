import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

source_client = bigquery.Client(project='daas-cdw-dev')
source_count = list(source_client.query("SELECT COUNT(*) AS c FROM `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`").result())[0].c

with open('.adtalem_credentials.json', 'r', encoding='utf-8') as f:
    ci = json.load(f)
creds = Credentials(
    token=None,
    refresh_token=ci['refresh_token'],
    token_uri='https://oauth2.googleapis.com/token',
    client_id=ci['client_id'],
    client_secret=ci['client_secret'],
    quota_project_id='dev-wu-agenticai-app-proj',
)

dest_client = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)
dest_row = list(dest_client.query("SELECT COUNT(*) AS c, MAX(_mirrored_at) AS max_m FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`").result())[0]

print(f"source_count={source_count}")
print(f"dest_count={dest_row.c}")
print(f"latest_mirrored_at={dest_row.max_m}")
print(f"in_sync={source_count == dest_row.c}")
