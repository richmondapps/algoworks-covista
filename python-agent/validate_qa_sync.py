"""Quick QA-sync validation: source vs QA row counts."""
import json
from google.cloud import bigquery
from google.oauth2.credentials import Credentials

src = bigquery.Client(project="daas-cdw-dev")
d = json.load(open(r"c:\Algoworks\1\main\python-agent\.adtalem_credentials.json"))
qc = Credentials(
    None,
    refresh_token=d["refresh_token"],
    client_id=d["client_id"],
    client_secret=d["client_secret"],
    token_uri="https://oauth2.googleapis.com/token",
    quota_project_id="qa-wu-agenticai-app-proj",
)
qa = bigquery.Client(project="qa-wu-agenticai-app-proj", credentials=qc)

tables = [
    ("wldn_r2c_student_activity_log", "r2c_student_activity_log"),
    ("wldn_r2c_student_profile", "student_core"),
    ("wldn_r2c_student_profile_log", "student_profile_log"),
]

print(f"{'Table':<38} {'Source':>10} {'QA':>10}  Match")
print("-" * 75)
for s, d_tbl in tables:
    sn = list(
        src.query(f"SELECT COUNT(*) n FROM `daas-cdw-dev.rpt_ai_solutions.{s}`").result()
    )[0].n
    qn = list(
        qa.query(
            f"SELECT COUNT(*) n FROM `qa-wu-agenticai-app-proj.covista_demo.{d_tbl}`"
        ).result()
    )[0].n
    status = "OK" if sn == qn else "MISMATCH"
    print(f"{d_tbl:<38} {sn:>10,} {qn:>10,}  {status}")
