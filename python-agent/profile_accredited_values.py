import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

ACTS = [
    'first_course_registration',
    'wwow_login',
    'logged_into_course',
    'course_drop'
]
acts_arr = ','.join([f"'{a}'" for a in ACTS])

with open('.adtalem_credentials.json','r',encoding='utf-8') as f:
    ci=json.load(f)
creds=Credentials(token=None,refresh_token=ci['refresh_token'],token_uri='https://oauth2.googleapis.com/token',client_id=ci['client_id'],client_secret=ci['client_secret'],quota_project_id='dev-wu-agenticai-app-proj')

src = bigquery.Client(project='daas-cdw-dev')
dst = bigquery.Client(project='dev-wu-agenticai-app-proj', credentials=creds)

q = """
WITH acts AS (
  SELECT activity_name FROM UNNEST([{acts}]) AS activity_name
), agg AS (
  SELECT
    activity_name,
    COUNT(*) AS total_rows,
    COUNTIF(is_accredited IS NOT NULL) AS non_null_rows,
    ARRAY_AGG(DISTINCT CAST(is_accredited AS STRING) IGNORE NULLS) AS distinct_values
  FROM `{table}`
  WHERE activity_name IN (SELECT activity_name FROM acts)
  GROUP BY activity_name
)
SELECT
  acts.activity_name,
  COALESCE(agg.total_rows, 0) AS total_rows,
  COALESCE(agg.non_null_rows, 0) AS non_null_rows,
  agg.distinct_values
FROM acts
LEFT JOIN agg USING(activity_name)
ORDER BY acts.activity_name
"""

for label, client, table in [
    ('SOURCE', src, 'daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log'),
    ('DEST', dst, 'dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log')
]:
    print(f'=== {label} ===')
    rows = list(client.query(q.format(acts=acts_arr, table=table)).result())
    for r in rows:
        print(f"{r.activity_name}|total={r.total_rows}|non_null={r.non_null_rows}|distinct={list(r.distinct_values) if r.distinct_values is not None else []}")
    print('')
