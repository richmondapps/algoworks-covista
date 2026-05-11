"""Apr 30 — confirm Sahil/Alpesh's NULL-datetime cleanup landed in source."""
import json
from google.oauth2.credentials import Credentials
from google.cloud import bigquery

c = json.load(open(".adtalem_credentials.json"))
creds = Credentials(
    token=None,
    refresh_token=c["refresh_token"],
    token_uri=c.get("token_uri", "https://oauth2.googleapis.com/token"),
    client_id=c["client_id"],
    client_secret=c["client_secret"],
    quota_project_id="dev-wu-agenticai-app-proj",
)
bq = bigquery.Client(project="dev-wu-agenticai-app-proj", credentials=creds)

q = """
SELECT activity_name,
       COUNT(*) AS total,
       COUNTIF(activity_datetime IS NULL) AS null_dt,
       ROUND(100 * COUNTIF(activity_datetime IS NULL) / COUNT(*), 2) AS pct_null
FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
WHERE activity_category = 'student_event'
GROUP BY activity_name
ORDER BY total DESC
"""
print(f"{'activity_name':40s} {'total':>10s} {'null_dt':>10s} {'pct_null':>10s}")
print("-" * 75)
for r in bq.query(q).result():
    print(f"{r.activity_name:40s} {r.total:>10,} {r.null_dt:>10,} {r.pct_null:>9}%")
