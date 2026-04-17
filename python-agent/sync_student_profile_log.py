"""
BQ-to-BQ Mirror Pipeline — student_profile_log (change audit trail)
Mirrors wldn_r2c_student_profile_log from client source BQ into our project BQ.

Architecture:
  daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_profile_log  (source)
      ↓  this script
  dev-wu-agenticai-app-proj.covista_demo.student_profile_log  (destination)

Usage:
  python sync_student_profile_log.py                  # mirror all rows
  python sync_student_profile_log.py --limit 10       # mirror first 10 rows
  python sync_student_profile_log.py --dry-run        # print query only
"""

import argparse
import os
from datetime import date, datetime, time, timezone
from decimal import Decimal

from google.cloud import bigquery


def _serialize_value(v):
    if v is None:
        return v
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, time):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return v


SOURCE_PROJECT = "daas-cdw-dev"
SOURCE_DATASET = "rpt_ai_solutions"
SOURCE_TABLE = "wldn_r2c_student_profile_log"
SOURCE_FQN = f"{SOURCE_PROJECT}.{SOURCE_DATASET}.{SOURCE_TABLE}"

DEST_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "dev-wu-agenticai-app-proj")
DEST_DATASET = "covista_demo"
DEST_TABLE = "student_profile_log"
DEST_FQN = f"{DEST_PROJECT}.{DEST_DATASET}.{DEST_TABLE}"

COLUMNS = [
    "audit_id",
    "student_id",
    "term_code",
    "change_ts",
    "event_type",
    "column_name",
    "old_value",
    "new_value",
]

DEST_SCHEMA = [
    bigquery.SchemaField("audit_id", "STRING"),
    bigquery.SchemaField("student_id", "STRING"),
    bigquery.SchemaField("term_code", "STRING"),
    bigquery.SchemaField("change_ts", "TIMESTAMP"),
    bigquery.SchemaField("event_type", "STRING"),
    bigquery.SchemaField("column_name", "STRING"),
    bigquery.SchemaField("old_value", "STRING"),
    bigquery.SchemaField("new_value", "STRING"),
    bigquery.SchemaField("_mirrored_at", "TIMESTAMP"),
]

DEST_DDL = f"""
CREATE TABLE IF NOT EXISTS `{DEST_FQN}` (
    audit_id STRING,
    student_id STRING,
    term_code STRING,
    change_ts TIMESTAMP,
    event_type STRING,
    column_name STRING,
    old_value STRING,
    new_value STRING,
    _mirrored_at TIMESTAMP
)
"""

ADTALEM_CREDS_PATH = os.path.join(os.path.dirname(__file__), ".adtalem_credentials.json")


def get_clients():
    import google.auth
    from google.oauth2.credentials import Credentials

    adc_creds, _ = google.auth.default()
    source_client = bigquery.Client(project=SOURCE_PROJECT, credentials=adc_creds)

    if os.path.exists(ADTALEM_CREDS_PATH):
        import json
        with open(ADTALEM_CREDS_PATH) as f:
            cred_info = json.load(f)
        dest_creds = Credentials(
            token=None,
            refresh_token=cred_info["refresh_token"],
            token_uri=cred_info.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=cred_info["client_id"],
            client_secret=cred_info["client_secret"],
            quota_project_id=DEST_PROJECT,
        )
        dest_client = bigquery.Client(project=DEST_PROJECT, credentials=dest_creds)
        print("[ProfileLog] Using separate Adtalem credentials for destination.")
    else:
        dest_client = bigquery.Client(project=DEST_PROJECT, credentials=adc_creds)
        print("[ProfileLog] Using ADC for both source and destination.")

    return source_client, dest_client


def ensure_dest_table(dest_client):
    dataset_ref = bigquery.DatasetReference(DEST_PROJECT, DEST_DATASET)
    try:
        dest_client.get_dataset(dataset_ref)
    except Exception:
        dest_client.create_dataset(bigquery.Dataset(dataset_ref), exists_ok=True)

    print(f"[ProfileLog] Ensuring destination table {DEST_FQN}")
    dest_client.query(DEST_DDL).result()
    print("[ProfileLog] Destination table ready.")


def build_source_query(limit=None):
    cols = ",\n    ".join(COLUMNS)
    query = f"SELECT\n    {cols}\nFROM `{SOURCE_FQN}`"
    if limit:
        query += f"\nORDER BY change_ts DESC\nLIMIT {int(limit)}"
    return query


def mirror(limit=None, dry_run=False):
    source_client, dest_client = get_clients()

    query = build_source_query(limit=limit)
    print(f"[ProfileLog] Source query:\n{query}\n")

    if dry_run:
        print("[ProfileLog] Dry run — not executing.")
        return

    ensure_dest_table(dest_client)

    print(f"[ProfileLog] Reading from {SOURCE_FQN}...")
    result_iter = source_client.query(query).result()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    table_ref = dest_client.dataset(DEST_DATASET).table(DEST_TABLE)

    rows = []
    for row in result_iter:
        record = {col: _serialize_value(row.get(col)) for col in COLUMNS}
        record["_mirrored_at"] = now
        rows.append(record)

    if not rows:
        print("[ProfileLog] No rows to mirror. Done.")
        return

    print(f"[ProfileLog] Writing {len(rows):,} rows to {DEST_FQN}...")
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=DEST_SCHEMA,
    )
    dest_client.load_table_from_json(rows, table_ref, job_config=job_config).result()

    print(f"[ProfileLog] Done! {len(rows):,} rows written to {DEST_FQN}")

    count = list(dest_client.query(f"SELECT COUNT(*) AS cnt FROM `{DEST_FQN}`").result())
    print(f"[ProfileLog] Destination table now has {count[0].cnt:,} total rows.")


def main():
    parser = argparse.ArgumentParser(
        description="Mirror wldn_r2c_student_profile_log from daas-cdw-dev to covista_demo.student_profile_log"
    )
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print(f"Student Profile Log Mirror — {datetime.now(timezone.utc).isoformat()}")
    print(f"Source: {SOURCE_FQN}")
    print(f"Dest:   {DEST_FQN}")
    if args.limit:
        print(f"Limit:  {args.limit} rows")
    print("=" * 60)

    mirror(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
