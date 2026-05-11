import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

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

client = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)
query = '''
SELECT COUNT(*) AS row_count, MAX(_mirrored_at) AS latest_mirrored_at
FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
'''
row = list(client.query(query).result())[0]
print(f"row_count={row.row_count}")
print(f"latest_mirrored_at={row.latest_mirrored_at}")
