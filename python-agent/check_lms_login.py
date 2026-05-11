from google.oauth2.credentials import Credentials
import json
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
WHERE LOWER(activity_name) LIKE '%lms%' OR LOWER(activity_name) LIKE '%login%'
GROUP BY 1,2
ORDER BY cnt DESC
"""
for r in bq.query(q).result():
    print(r.activity_category, "|", r.activity_name, "|", r.cnt)
