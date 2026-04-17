"""
BQ-to-BQ Mirror Pipeline
Mirrors data from client source BQ (daas-cdw-dev) into our project BQ (dev-wu-agenticai-app-proj).

Architecture:
  daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log  (source — client/Data team)
      ↓  this script
  dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log  (destination — our BQ)
      ↓  sync-from-bq.ts (existing Node ingester)
  Firestore salesforce_opportunities/{student_id} + subcollections

Usage:
  python sync_bq_to_bq.py                  # mirror all rows
  python sync_bq_to_bq.py --limit 10       # mirror first 10 rows (for testing)
  python sync_bq_to_bq.py --incremental    # only rows newer than last sync
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
SOURCE_TABLE = "wldn_r2c_student_activity_log"
SOURCE_FQN = f"{SOURCE_PROJECT}.{SOURCE_DATASET}.{SOURCE_TABLE}"

# ── Destination (our BQ) ────────────────────────────────────────────────
DEST_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "dev-wu-agenticai-app-proj")
DEST_DATASET = "covista_demo"
DEST_TABLE = "r2c_student_activity_log"
DEST_FQN = f"{DEST_PROJECT}.{DEST_DATASET}.{DEST_TABLE}"

# ── Columns to mirror (v17.7 contract — excludes internal DE fields) ───
COLUMNS = [
    "log_id",
    "student_id",
    "term_code",
    "activity_category",
    "activity_name",
    "activity_datetime",
    # Task fields
    "communication_type",
    "task_notes",
    "task_comments",
    "task_status",
    # Case fields
    "case_number",
    "case_subject",
    "case_record_type",
    "case_type",
    "case_subtype",
    "case_status",
    "case_closed_reason",
    "case_closed_datetime",
    "case_created_date",
    "case_comments",
    # Source tracking
    "actor",
    "source_system",
    "last_updated_timestamp",
    # Course context
    "course_identification",
    "course_level",
    "course_status",
    "is_accredited",
    # Contingency fields (v17.6+)
    "contingency_requirement",
    "contingency_institution_name",
    "contingency_status",
    # FAFSA fields (v17.7)
    "fafsa_interest_in_federal_aid",
    "fafsa_intend_to_fund",
]

# Explicitly excluded: dw_etl_chg_hash, etl_created_at (internal DE use only)

# Fields that have mixed types in source (BOOLEAN/STRING) — normalize to STRING
_FORCE_STRING_FIELDS = {"is_accredited", "fafsa_interest_in_federal_aid"}

# Explicit schema for load jobs — prevents autodetect from guessing wrong types
DEST_SCHEMA = [
    bigquery.SchemaField("log_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("student_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("term_code", "STRING"),
    bigquery.SchemaField("activity_category", "STRING"),
    bigquery.SchemaField("activity_name", "STRING"),
    bigquery.SchemaField("activity_datetime", "TIMESTAMP"),
    bigquery.SchemaField("communication_type", "STRING"),
    bigquery.SchemaField("task_notes", "STRING"),
    bigquery.SchemaField("task_comments", "STRING"),
    bigquery.SchemaField("task_status", "STRING"),
    bigquery.SchemaField("case_number", "STRING"),
    bigquery.SchemaField("case_subject", "STRING"),
    bigquery.SchemaField("case_record_type", "STRING"),
    bigquery.SchemaField("case_type", "STRING"),
    bigquery.SchemaField("case_subtype", "STRING"),
    bigquery.SchemaField("case_status", "STRING"),
    bigquery.SchemaField("case_closed_reason", "STRING"),
    bigquery.SchemaField("case_closed_datetime", "TIMESTAMP"),
    bigquery.SchemaField("case_created_date", "DATE"),
    bigquery.SchemaField("case_comments", "STRING"),
    bigquery.SchemaField("actor", "STRING"),
    bigquery.SchemaField("source_system", "STRING"),
    bigquery.SchemaField("last_updated_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("course_identification", "STRING"),
    bigquery.SchemaField("course_level", "STRING"),
    bigquery.SchemaField("course_status", "STRING"),
    bigquery.SchemaField("is_accredited", "STRING"),
    bigquery.SchemaField("contingency_requirement", "STRING"),
    bigquery.SchemaField("contingency_institution_name", "STRING"),
    bigquery.SchemaField("contingency_status", "STRING"),
    bigquery.SchemaField("fafsa_interest_in_federal_aid", "STRING"),
    bigquery.SchemaField("fafsa_intend_to_fund", "STRING"),
    bigquery.SchemaField("_mirrored_at", "TIMESTAMP"),
]
# ── DDL for destination table ───────────────────────────────────────────
DEST_DDL = f"""
CREATE TABLE IF NOT EXISTS `{DEST_FQN}` (
    log_id STRING NOT NULL,
    student_id STRING NOT NULL,
    term_code STRING,
    activity_category STRING,
    activity_name STRING,
    activity_datetime TIMESTAMP,
    communication_type STRING,
    task_notes STRING,
    task_comments STRING,
    task_status STRING,
    case_number STRING,
    case_subject STRING,
    case_record_type STRING,
    case_type STRING,
    case_subtype STRING,
    case_status STRING,
    case_closed_reason STRING,
    case_closed_datetime TIMESTAMP,
    case_created_date DATE,
    case_comments STRING,
    actor STRING,
    source_system STRING,
    last_updated_timestamp TIMESTAMP,
    course_identification STRING,
    course_level STRING,
    course_status STRING,
    is_accredited STRING,
    contingency_requirement STRING,
    contingency_institution_name STRING,
    contingency_status STRING,
    fafsa_interest_in_federal_aid STRING,
    fafsa_intend_to_fund STRING,
    _mirrored_at TIMESTAMP
)
"""

# Path to Adtalem credentials for writing to dest project
ADTALEM_CREDS_PATH = os.path.join(
    os.path.dirname(__file__), ".adtalem_credentials.json"
)


def get_clients():
    """Return two BQ clients using different credentials.

    - source_client: uses ADC (Waldenu) — can read from daas-cdw-dev
    - dest_client: uses Adtalem creds — can write to dev-wu-agenticai-app-proj

    If no separate Adtalem creds file exists, both use ADC (single-account mode).
    """
    import google.auth
    from google.oauth2 import credentials as oauth2_creds

    # Source client: ADC (Waldenu account) — runs jobs on daas-cdw-dev
    adc_creds, _ = google.auth.default()
    source_client = bigquery.Client(project=SOURCE_PROJECT, credentials=adc_creds)

    # Dest client: use Adtalem creds if available, otherwise fall back to ADC
    if os.path.exists(ADTALEM_CREDS_PATH):
        import json
        with open(ADTALEM_CREDS_PATH) as f:
            cred_info = json.load(f)
        from google.oauth2.credentials import Credentials
        dest_creds = Credentials(
            token=None,
            refresh_token=cred_info["refresh_token"],
            token_uri=cred_info.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=cred_info["client_id"],
            client_secret=cred_info["client_secret"],
            quota_project_id=DEST_PROJECT,
        )
        dest_client = bigquery.Client(project=DEST_PROJECT, credentials=dest_creds)
        print("[Mirror] Using separate Adtalem credentials for destination.")
    else:
        dest_client = bigquery.Client(project=DEST_PROJECT, credentials=adc_creds)
        print("[Mirror] Using ADC for both source and destination.")

    return source_client, dest_client


def ensure_dest_table(dest_client: bigquery.Client):
    """Create destination dataset + table if they don't exist."""
    dataset_ref = bigquery.DatasetReference(DEST_PROJECT, DEST_DATASET)
    try:
        dest_client.get_dataset(dataset_ref)
    except Exception:
        print(f"[Mirror] Creating dataset {DEST_PROJECT}.{DEST_DATASET}")
        dest_client.create_dataset(bigquery.Dataset(dataset_ref), exists_ok=True)

    print(f"[Mirror] Ensuring destination table {DEST_FQN}")
    job = dest_client.query(DEST_DDL)
    job.result()
    print("[Mirror] Destination table ready.")


def build_source_query(limit: int | None = None, incremental: bool = False,
                       dest_client: bigquery.Client | None = None) -> str:
    """Build the SELECT query against the source table."""
    cols = ",\n    ".join(COLUMNS)
    query = f"SELECT\n    {cols}\nFROM `{SOURCE_FQN}`"

    if incremental and dest_client:
        # Only fetch rows newer than the latest we already have
        max_ts_query = f"SELECT MAX(last_updated_timestamp) AS max_ts FROM `{DEST_FQN}`"
        try:
            rows = list(dest_client.query(max_ts_query).result())
            max_ts = rows[0].max_ts if rows and rows[0].max_ts else None
            if max_ts:
                ts_str = max_ts.strftime("%Y-%m-%d %H:%M:%S")
                query += f"\nWHERE last_updated_timestamp > TIMESTAMP('{ts_str}')"
                print(f"[Mirror] Incremental: fetching rows after {ts_str}")
        except Exception as e:
            print(f"[Mirror] Could not read max timestamp, doing full sync: {e}")

    # Skip ORDER BY for full sync — unnecessary for WRITE_TRUNCATE and very expensive
    # on large tables (788K+ rows). Only sort for limited/test runs.
    if limit:
        query += f"\nORDER BY student_id, activity_datetime\nLIMIT {int(limit)}"

    return query


def _write_chunk(dest_client, table_ref, rows, write_disposition, incremental):
    """Write a chunk of rows to the destination table."""
    job_config = bigquery.LoadJobConfig(
        write_disposition=write_disposition,
        schema=DEST_SCHEMA,
    )
    if write_disposition == bigquery.WriteDisposition.WRITE_APPEND:
        job_config.schema_update_options = [
            bigquery.SchemaUpdateOption.ALLOW_FIELD_ADDITION,
            bigquery.SchemaUpdateOption.ALLOW_FIELD_RELAXATION,
        ]
    job = dest_client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()


def _delete_existing_ids(dest_client, rows):
    """Delete existing log_ids from dest before incremental insert."""
    log_ids = [r.get("log_id") for r in rows if r.get("log_id")]
    for i in range(0, len(log_ids), 1000):
        chunk = log_ids[i : i + 1000]
        ids_str = ", ".join(f"'{lid}'" for lid in chunk)
        del_query = f"DELETE FROM `{DEST_FQN}` WHERE log_id IN ({ids_str})"
        dest_client.query(del_query).result()


def mirror(limit: int | None = None, incremental: bool = False, dry_run: bool = False):
    """Execute the BQ-to-BQ mirror."""
    source_client, dest_client = get_clients()

    # 1. Build source query (do this first so dry-run can print it)
    query = build_source_query(limit=limit, incremental=incremental,
                               dest_client=dest_client if not dry_run else None)
    print(f"[Mirror] Source query:\n{query}\n")

    if dry_run:
        print("[Mirror] Dry run — not executing.")
        return

    # 2. Ensure destination table exists
    ensure_dest_table(dest_client)

    # 3. Read from source using streaming iteration (memory-efficient)
    print(f"[Mirror] Reading from {SOURCE_FQN}...")
    query_job = source_client.query(query)
    result_iter = query_job.result()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    table_ref = dest_client.dataset(DEST_DATASET).table(DEST_TABLE)

    CHUNK_SIZE = 50_000
    total_written = 0
    chunk = []
    first_chunk = True

    for row in result_iter:
        record = {col: _serialize_value(row.get(col)) for col in COLUMNS}
        # Normalize mixed-type fields to STRING
        for f in _FORCE_STRING_FIELDS:
            if record.get(f) is not None:
                record[f] = str(record[f])
        record["_mirrored_at"] = now
        chunk.append(record)

        if len(chunk) >= CHUNK_SIZE:
            disposition = (
                bigquery.WriteDisposition.WRITE_TRUNCATE
                if first_chunk and not incremental
                else bigquery.WriteDisposition.WRITE_APPEND
            )
            if incremental:
                _delete_existing_ids(dest_client, chunk)
            _write_chunk(dest_client, table_ref, chunk, disposition, incremental)
            total_written += len(chunk)
            print(f"[Mirror]   ...wrote chunk ({total_written:,} rows so far)")
            chunk = []
            first_chunk = False

    # Write remaining rows
    if chunk:
        disposition = (
            bigquery.WriteDisposition.WRITE_TRUNCATE
            if first_chunk and not incremental
            else bigquery.WriteDisposition.WRITE_APPEND
        )
        if incremental:
            _delete_existing_ids(dest_client, chunk)
        _write_chunk(dest_client, table_ref, chunk, disposition, incremental)
        total_written += len(chunk)

    if total_written == 0:
        print("[Mirror] No rows to mirror. Done.")
        return

    print(f"[Mirror] Done! {total_written:,} rows written to {DEST_FQN}")

    # 5. Quick validation
    count_query = f"SELECT COUNT(*) AS cnt FROM `{DEST_FQN}`"
    count_result = list(dest_client.query(count_query).result())
    print(f"[Mirror] Destination table now has {count_result[0].cnt} total rows.")


def main():
    parser = argparse.ArgumentParser(
        description="Mirror wldn_r2c_student_activity_log from daas-cdw-dev to dev-wu-agenticai-app-proj"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Limit number of rows to mirror (e.g. --limit 10 for testing)"
    )
    parser.add_argument(
        "--incremental", action="store_true",
        help="Only mirror rows newer than the latest in destination"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print the source query without executing"
    )
    args = parser.parse_args()

    print("=" * 60)
    print(f"BQ-to-BQ Mirror Pipeline — {datetime.now(timezone.utc).isoformat()}")
    print(f"Source: {SOURCE_FQN}")
    print(f"Dest:   {DEST_FQN}")
    print(f"Mode:   {'incremental' if args.incremental else 'full'}")
    if args.limit:
        print(f"Limit:  {args.limit} rows")
    print("=" * 60)

    mirror(limit=args.limit, incremental=args.incremental, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
