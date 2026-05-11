import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

ACTS = [
    'first_course_registration',
    'wwow_login',
    'logged_into_course',
    'course_drop'
]
acts_sql = ','.join([f"'{a}'" for a in ACTS])

src = bigquery.Client(project='daas-cdw-dev')
with open('.adtalem_credentials.json','r',encoding='utf-8') as f:
    ci=json.load(f)
creds=Credentials(token=None,refresh_token=ci['refresh_token'],token_uri='https://oauth2.googleapis.com/token',client_id=ci['client_id'],client_secret=ci['client_secret'],quota_project_id='dev-wu-agenticai-app-proj')
dst = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)

q_tpl = """
SELECT activity_name,
       COUNT(*) AS total_rows,
       COUNTIF(is_accredited IS NOT NULL) AS is_accredited_non_null,
       COUNTIF(CAST(is_accredited AS STRING) IN ('true','TRUE','1')) AS is_accredited_true,
       COUNTIF(CAST(is_accredited AS STRING) IN ('false','FALSE','0')) AS is_accredited_false
FROM `{table}`
WHERE activity_name IN ({acts})
GROUP BY activity_name
ORDER BY activity_name
"""

for label, client, table in [
    ('SOURCE', src, 'daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log'),
    ('DEST_BEFORE', dst, 'dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log')
]:
    print(f'=== {label} ===')
    rows = list(client.query(q_tpl.format(table=table, acts=acts_sql)).result())
    for r in rows:
        print(f"{r.activity_name}|total={r.total_rows}|non_null={r.is_accredited_non_null}|true={r.is_accredited_true}|false={r.is_accredited_false}")
    print('')
