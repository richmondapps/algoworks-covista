"""
BQ-to-BQ Mirror Pipeline — student_core (student profile)
Mirrors wldn_r2c_student_profile from client source BQ into our project BQ.

Architecture:
  daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_profile  (source — client/Data team)
      ↓  this script
  dev-wu-agenticai-app-proj.covista_demo.student_core  (destination — our BQ)

Usage:
  python sync_student_core.py                  # mirror all rows (WRITE_TRUNCATE)
  python sync_student_core.py --limit 10       # mirror first 10 rows (for testing)
  python sync_student_core.py --dry-run        # print query without executing
"""

import argparse
import os
import sys
from datetime import date, datetime, time, timezone
from decimal import Decimal

from google.cloud import bigquery


def _serialize_value(v):
    """Convert non-JSON-serializable BQ types to safe primitives."""
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


# ── Source (client BQ — read-only) ──────────────────────────────────────
SOURCE_PROJECT = "daas-cdw-dev"
SOURCE_DATASET = "rpt_ai_solutions"
SOURCE_TABLE = "wldn_r2c_student_profile"
SOURCE_FQN = f"{SOURCE_PROJECT}.{SOURCE_DATASET}.{SOURCE_TABLE}"

# ── Destination (our BQ) ────────────────────────────────────────────────
DEST_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "dev-wu-agenticai-app-proj")
DEST_DATASET = "covista_demo"
DEST_TABLE = "student_core"
DEST_FQN = f"{DEST_PROJECT}.{DEST_DATASET}.{DEST_TABLE}"

# ── Columns to mirror (excludes internal DE fields) ────────────────────
COLUMNS = [
    "student_id",
    "student_name",
    "institution",
    "program",
    "program_name",
    "term_code",
    "term_desc",
    "status_stage",
    "enrollment_specialist_name",
    "program_start_date",
    "reserve_date",
    "census_date",
    "funding_type",
    "time_to_program_start_days",
    "time_since_reserve_days",
    "last_updated_at",
]
# Explicitly excluded: dw_etl_chg_hash, etl_created_at (internal DE use only)

# Explicit schema for the destination table
DEST_SCHEMA = [
    bigquery.SchemaField("student_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("student_name", "STRING"),
    bigquery.SchemaField("institution", "STRING"),
    bigquery.SchemaField("program", "STRING"),
    bigquery.SchemaField("program_name", "STRING"),
    bigquery.SchemaField("term_code", "STRING"),
    bigquery.SchemaField("term_desc", "STRING"),
    bigquery.SchemaField("status_stage", "STRING"),
    bigquery.SchemaField("enrollment_specialist_name", "STRING"),
    bigquery.SchemaField("program_start_date", "DATE"),
    bigquery.SchemaField("reserve_date", "DATE"),
    bigquery.SchemaField("census_date", "DATE"),
    bigquery.SchemaField("funding_type", "STRING"),
    bigquery.SchemaField("time_to_program_start_days", "INTEGER"),
    bigquery.SchemaField("time_since_reserve_days", "INTEGER"),
    bigquery.SchemaField("last_updated_at", "TIMESTAMP"),
    bigquery.SchemaField("_mirrored_at", "TIMESTAMP"),
]

DEST_DDL = f"""
CREATE TABLE IF NOT EXISTS `{DEST_FQN}` (
    student_id STRING NOT NULL,
    student_name STRING,
    institution STRING,
    program STRING,
    program_name STRING,
    term_code STRING,
    term_desc STRING,
    status_stage STRING,
    enrollment_specialist_name STRING,
    program_start_date DATE,
    reserve_date DATE,
    census_date DATE,
    funding_type STRING,
    time_to_program_start_days INT64,
    time_since_reserve_days INT64,
    last_updated_at TIMESTAMP,
    _mirrored_at TIMESTAMP
)
"""

# Path to Adtalem credentials for writing to dest project
ADTALEM_CREDS_PATH = os.path.join(os.path.dirname(__file__), ".adtalem_credentials.json")


def get_clients():
    """Return two BQ clients using different credentials.

    - source_client: uses ADC (Waldenu) — can read from daas-cdw-dev
    - dest_client: uses Adtalem creds — can write to dev-wu-agenticai-app-proj
    """
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
        print("[StudentCore] Using separate Adtalem credentials for destination.")
    else:
        dest_client = bigquery.Client(project=DEST_PROJECT, credentials=adc_creds)
        print("[StudentCore] Using ADC for both source and destination.")

    return source_client, dest_client


def ensure_dest_table(dest_client: bigquery.Client):
    """Create destination dataset + table if they don't exist."""
    dataset_ref = bigquery.DatasetReference(DEST_PROJECT, DEST_DATASET)
    try:
        dest_client.get_dataset(dataset_ref)
    except Exception:
        print(f"[StudentCore] Creating dataset {DEST_PROJECT}.{DEST_DATASET}")
        dest_client.create_dataset(bigquery.Dataset(dataset_ref), exists_ok=True)

    print(f"[StudentCore] Ensuring destination table {DEST_FQN}")
    job = dest_client.query(DEST_DDL)
    job.result()
    print("[StudentCore] Destination table ready.")


def build_source_query(limit=None):
    """Build the SELECT query against the source table."""
    cols = ",\n    ".join(COLUMNS)
    query = f"SELECT\n    {cols}\nFROM `{SOURCE_FQN}`"
    if limit:
        query += f"\nORDER BY student_id\nLIMIT {int(limit)}"
    return query


def mirror(limit=None, dry_run=False):
    """Execute the BQ-to-BQ mirror for student_core."""
    source_client, dest_client = get_clients()

    query = build_source_query(limit=limit)
    print(f"[StudentCore] Source query:\n{query}\n")

    if dry_run:
        print("[StudentCore] Dry run — not executing.")
        return

    # Ensure destination table exists
    ensure_dest_table(dest_client)

    # Read from source
    print(f"[StudentCore] Reading from {SOURCE_FQN}...")
    query_job = source_client.query(query)
    result_iter = query_job.result()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    table_ref = dest_client.dataset(DEST_DATASET).table(DEST_TABLE)

    # 5,792 rows is small — single chunk is fine
    rows = []
    for row in result_iter:
        record = {col: _serialize_value(row.get(col)) for col in COLUMNS}
        record["_mirrored_at"] = now
        rows.append(record)

    if not rows:
        print("[StudentCore] No rows to mirror. Done.")
        return

    print(f"[StudentCore] Writing {len(rows):,} rows to {DEST_FQN}...")
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        schema=DEST_SCHEMA,
    )
    job = dest_client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()

    print(f"[StudentCore] Done! {len(rows):,} rows written to {DEST_FQN}")

    # Quick validation
    count_result = list(dest_client.query(f"SELECT COUNT(*) AS cnt FROM `{DEST_FQN}`").result())
    print(f"[StudentCore] Destination table now has {count_result[0].cnt:,} total rows.")


def main():
    parser = argparse.ArgumentParser(
        description="Mirror wldn_r2c_student_profile from daas-cdw-dev to dev-wu-agenticai-app-proj.covista_demo.student_core"
    )
    parser.add_argument("--limit", type=int, default=None, help="Limit rows (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Print query without executing")
    args = parser.parse_args()

    print("=" * 60)
    print(f"Student Core Mirror — {datetime.now(timezone.utc).isoformat()}")
    print(f"Source: {SOURCE_FQN}")
    print(f"Dest:   {DEST_FQN}")
    if args.limit:
        print(f"Limit:  {args.limit} rows")
    print("=" * 60)

    mirror(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
