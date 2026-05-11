"""Apr 30 11:40am batch: confirm reducer-bug theory.

If Rachel Moore (A01294391) and Lucy Tabe (A01252178) have
first_course_registration rows in OUR dev mirror, then Jake's reducer
is dropping them downstream. Sync + source are exonerated.
"""
import json
import os
import sys
from pathlib import Path

from google.cloud import bigquery
from google.oauth2.credentials import Credentials

CRED_PATH = Path(".adtalem_credentials.json")
PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "dev-wu-agenticai-app-proj")
TABLE = f"{PROJECT}.covista_demo.r2c_student_activity_log"

STUDENTS = ["A01294391", "A01252178"]


def main() -> int:
    if not CRED_PATH.exists():
        print(f"ERROR: missing {CRED_PATH}. Run from python-agent/.", file=sys.stderr)
        return 1

    info = json.loads(CRED_PATH.read_text())
    creds = Credentials(
        token=None,
        refresh_token=info["refresh_token"],
        token_uri=info.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=info["client_id"],
        client_secret=info["client_secret"],
        quota_project_id=PROJECT,
    )

    client = bigquery.Client(project=PROJECT, credentials=creds)
    sql = f"""
    SELECT student_id, activity_category, activity_name, activity_datetime
    FROM `{TABLE}`
    WHERE student_id IN UNNEST(@ids)
    ORDER BY student_id, activity_datetime
    """
    job = client.query(
        sql,
        job_config=bigquery.QueryJobConfig(
            query_parameters=[bigquery.ArrayQueryParameter("ids", "STRING", STUDENTS)]
        ),
    )
    rows = list(job.result())
    print(f"Mirror: {TABLE}")
    print(f"Rows for {STUDENTS}: {len(rows)}")
    print("-" * 80)
    for r in rows:
        print(f"  {r.student_id}  {r.activity_category:20s}  {r.activity_name:35s}  {r.activity_datetime}")
    print("-" * 80)
    has_reg = {sid: any(r.student_id == sid and r.activity_name == "first_course_registration" for r in rows) for sid in STUDENTS}
    print("first_course_registration present in mirror?")
    for sid, found in has_reg.items():
        print(f"  {sid}: {'YES (mirror is fine; Jake reducer dropped it)' if found else 'NO (look upstream too)'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
