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
    quota_project_id="qa-wu-agenticai-app-proj",
)
bq = bigquery.Client(project="qa-wu-agenticai-app-proj", credentials=creds)
q = """
SELECT activity_name, fafsa_submission_flag, COUNT(*) AS cnt
FROM `qa-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
WHERE activity_name IN ("fafsa_submission","alternate_funding_submission")
GROUP BY 1,2
ORDER BY 1,2
"""
for r in bq.query(q).result():
    print(r.activity_name, r.fafsa_submission_flag, r.cnt)
