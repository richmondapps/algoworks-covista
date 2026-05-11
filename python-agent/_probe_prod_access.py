"""Quick probe: do we have read access to daas-cdw-prod tables?"""
import json, os, sys
from google.oauth2.credentials import Credentials
from google.cloud import bigquery

CREDS_PATH = os.environ.get("DEST_CREDENTIALS", r"C:\covista\main\python-agent\.adtalem_credentials.json")
PROJECT = "daas-cdw-prod"
DATASET = "rpt_ai_solutions"
TABLES = ["t_wldn_r2c_student_profile", "t_wldn_r2c_student_activity_log"]

with open(CREDS_PATH) as f:
    info = json.load(f)
creds = Credentials.from_authorized_user_info(info).with_quota_project(PROJECT)
client = bigquery.Client(project=PROJECT, credentials=creds)

print(f"== Probing {PROJECT}.{DATASET} as {info.get('client_id','?')[:20]}... ==")
for t in TABLES:
    fq = f"`{PROJECT}.{DATASET}.{t}`"
    try:
        meta = client.get_table(f"{PROJECT}.{DATASET}.{t}")
        print(f"[META OK] {t}: {meta.num_rows} rows, {len(meta.schema)} cols")
    except Exception as e:
        print(f"[META FAIL] {t}: {type(e).__name__}: {str(e)[:240]}")
        continue
    try:
        q = f"SELECT COUNT(*) AS n FROM {fq}"
        row = next(iter(client.query(q).result()))
        print(f"[READ OK] {t}: count={row.n}")
    except Exception as e:
        print(f"[READ FAIL] {t}: {type(e).__name__}: {str(e)[:240]}")
