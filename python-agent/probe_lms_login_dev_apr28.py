"""Quick probe: confirm lms_login rows exist in dev mirror."""
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
    quota_project_id="dev-wu-agenticai-app-proj",
)
client = bigquery.Client(project="dev-wu-agenticai-app-proj", credentials=creds)

q = """
SELECT activity_name, COUNT(*) AS row_count
FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
WHERE activity_name IN ('lms_login','wwow_login','wow_login','logged_into_course','discussion_board_submission','first_course_registration','course_drop','fafsa_submission','alternate_funding_submission','portal_login')
GROUP BY 1
ORDER BY row_count DESC
"""
for r in client.query(q).result():
    print(f"  {r.activity_name:35s} {r.row_count:>10,}")

print("\nLatest _mirrored_at:")
for r in client.query(
    "SELECT MAX(_mirrored_at) AS last FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`"
).result():
    print(f"  {r.last}")

print("\nSample lms_login row (dev):")
for r in client.query(
    "SELECT log_id, student_id, activity_category, activity_name, activity_datetime, source_system "
    "FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log` "
    "WHERE activity_name='lms_login' LIMIT 3"
).result():
    print(f"  {dict(r.items())}")
