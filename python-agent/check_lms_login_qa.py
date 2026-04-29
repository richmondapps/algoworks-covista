from google.oauth2.credentials import Credentials
from google.cloud import bigquery
import json
with open(".adtalem_credentials.json") as f:
    info = json.load(f)
creds = Credentials.from_authorized_user_info(info)
client = bigquery.Client(project="qa-wu-agenticai-app-proj", credentials=creds)
sql = """
SELECT activity_category, activity_name, COUNT(*) AS n
FROM `qa-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`
WHERE LOWER(activity_name) LIKE '%lms%' OR LOWER(activity_name) LIKE '%login%'
GROUP BY 1,2 ORDER BY n DESC
"""
for r in client.query(sql).result():
    print(f"{r.activity_category} | {r.activity_name} | {r.n}")
