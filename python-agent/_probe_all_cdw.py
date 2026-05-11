"""Probe BigQuery read access to all 3 CDW environments using ADC (browser-login identity)."""
from google.cloud import bigquery
import google.auth

creds, default_proj = google.auth.default()
print(f"== ADC identity context: default_project={default_proj} ==\n")

COMBOS = [
    ("daas-cdw-dev", "rpt_ai_solutions", "t_wldn_r2c_student_profile"),
    ("daas-cdw-dev", "rpt_ai_solutions", "t_wldn_r2c_student_activity_log"),
    ("daas-cdw-qa", "rpt_ai_solutions", "t_wldn_r2c_student_profile"),
    ("daas-cdw-qa", "rpt_ai_solutions", "t_wldn_r2c_student_activity_log"),
    ("daas-cdw-prod", "rpt_ai_solutions", "t_wldn_r2c_student_profile"),
    ("daas-cdw-prod", "rpt_ai_solutions", "t_wldn_r2c_student_activity_log"),
]

for proj, ds, tbl in COMBOS:
    fq_id = f"{proj}.{ds}.{tbl}"
    client = bigquery.Client(project=proj, credentials=creds)
    print(f"--- {fq_id} ---")
    # Metadata
    try:
        meta = client.get_table(fq_id)
        print(f"  [META OK] {meta.num_rows} rows / {len(meta.schema)} cols")
    except Exception as e:
        print(f"  [META FAIL] {type(e).__name__}: {str(e)[:200]}")
        continue
    # Query
    try:
        q = f"SELECT COUNT(*) AS n FROM `{fq_id}`"
        row = next(iter(client.query(q).result()))
        print(f"  [QUERY OK] count={row.n}")
    except Exception as e:
        print(f"  [QUERY FAIL] {type(e).__name__}: {str(e)[:200]}")
print("\n== done ==")
