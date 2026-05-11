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

print('=== SOURCE ===')
src_rows = list(src.query(q_tpl.format(table='daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log', acts=acts_sql)).result())
for r in src_rows:
    print(f"{r.activity_name}|total={r.total_rows}|non_null={r.is_accredited_non_null}|true={r.is_accredited_true}|false={r.is_accredited_false}")

print('\n=== DEST_AFTER ===')
dst_rows = list(dst.query(q_tpl.format(table='dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log', acts=acts_sql)).result())
for r in dst_rows:
    print(f"{r.activity_name}|total={r.total_rows}|non_null={r.is_accredited_non_null}|true={r.is_accredited_true}|false={r.is_accredited_false}")

# full table sync check
src_count = list(src.query("SELECT COUNT(*) AS c FROM `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`").result())[0].c
dst_chk = list(dst.query("SELECT COUNT(*) AS c, MAX(_mirrored_at) AS m FROM `dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log`").result())[0]
print('\n=== FULL_TABLE_CHECK ===')
print(f"source_count={src_count}")
print(f"dest_count={dst_chk.c}")
print(f"latest_mirrored_at={dst_chk.m}")
print(f"in_sync={src_count == dst_chk.c}")
