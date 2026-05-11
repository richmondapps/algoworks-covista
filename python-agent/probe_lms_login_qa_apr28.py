import json, os
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

with open(os.path.join(os.path.dirname(__file__), ".adtalem_credentials.json")) as f:
    ci = json.load(f)
creds = Credentials(
    token=None,
    refresh_token=ci["refresh_token"],
    token_uri=ci.get("token_uri", "https://oauth2.googleapis.com/token"),
    client_id=ci["client_id"],
    client_secret=ci["client_secret"],
    quota_project_id="qa-wu-agenticai-app-proj",
)
client = bigquery.Client(project="qa-wu-agenticai-app-proj", credentials=creds)

q = """
SELECT activity_name, COUNT(*) AS row_count
FROM `qa-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
GROUP BY 1
ORDER BY row_count DESC
"""
print("QA activity_name distribution:")
for r in client.query(q).result():
    print(f"  {r.activity_name:35s} {r.row_count:>10,}")

q2 = """
SELECT MAX(_mirrored_at) AS latest
FROM `qa-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
"""
print("\nLatest _mirrored_at (QA):")
for r in client.query(q2).result():
    print(f"  {r.latest}")
