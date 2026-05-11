"""Apr 30 — activity_name breakdown on dev mirror to spot delta vs Apr 28 (802,322 → 793,053)."""
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
SELECT activity_category, activity_name, COUNT(*) AS cnt
FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
GROUP BY 1, 2
ORDER BY cnt DESC
"""
print(f"{'category':25s} {'activity_name':40s} {'count':>10s}")
print("-" * 80)
total = 0
for r in bq.query(q).result():
    total += r.cnt
    print(f"{(r.activity_category or 'NULL'):25s} {(r.activity_name or 'NULL'):40s} {r.cnt:>10,}")
print("-" * 80)
print(f"{'TOTAL':66s} {total:>10,}")
