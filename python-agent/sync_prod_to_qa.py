"""
Prod → QA BQ Sync (Adtalem CDW prod → Walden QA)

Mirrors the two production R2C reporting tables from Adtalem prod into our QA
BigQuery so the web app (which still points at QA) can be exercised against
prod-fresh data for the May 5 pilot rehearsal.

Source (read-only — Adtalem prod):
    daas-cdw-prod.rpt_ai_solutions.t_wldn_r2c_student_profile
    daas-cdw-prod.rpt_ai_solutions.t_wldn_r2c_student_activity_log

Destination (our QA — write):
    <QA_PROJECT>.<QA_DATASET>.t_wldn_r2c_student_profile
    <QA_PROJECT>.<QA_DATASET>.t_wldn_r2c_student_activity_log

Auth requirements (the credential running this script must have):
  - bigquery.tables.getData on the two prod tables
  - bigquery.jobs.create on the QA project (to run the query/load)
  - bigquery.tables.create / bigquery.tables.updateData on the QA dataset

Approach:
    Uses a single BQ client (the runner's ADC) and executes
        CREATE OR REPLACE TABLE <qa>.<table> AS SELECT * FROM <prod>.<table>
    This is a full-refresh mirror — schema is copied from source automatically,
    no schema drift risk, no manual DDL needed.

Usage examples:
    # Default: full mirror of both tables to qa-wu-agenticai-app-proj.covista_demo
    python sync_prod_to_qa.py

    # Custom destination project / dataset
    python sync_prod_to_qa.py --dest-project qa-wu-agenticai-app-proj --dest-dataset covista_demo

    # Mirror only the profile table
    python sync_prod_to_qa.py --tables t_wldn_r2c_student_profile

    # Dry run — print SQL only, do not execute
    python sync_prod_to_qa.py --dry-run

    # Sample-only (first N rows of each table — for smoke testing)
    python sync_prod_to_qa.py --limit 100
"""

import argparse
import sys
from datetime import datetime, timezone

from google.cloud import bigquery


# ── Source (Adtalem prod — read-only) ──────────────────────────────────
SOURCE_PROJECT = "daas-cdw-prod"
SOURCE_DATASET = "rpt_ai_solutions"
SOURCE_TABLES = [
    "t_wldn_r2c_student_profile",
    "t_wldn_r2c_student_activity_log",
]

# ── Default destination (Walden QA) ────────────────────────────────────
DEFAULT_DEST_PROJECT = "qa-wu-agenticai-app-proj"
DEFAULT_DEST_DATASET = "covista_demo"


def ensure_dataset(client: bigquery.Client, project: str, dataset: str) -> None:
    ref = bigquery.DatasetReference(project, dataset)
    try:
        client.get_dataset(ref)
        print(f"[ProdSync] Dataset OK: {project}.{dataset}")
    except Exception:
        print(f"[ProdSync] Creating dataset: {project}.{dataset}")
        client.create_dataset(bigquery.Dataset(ref), exists_ok=True)


def mirror_table(
    client: bigquery.Client,
    table: str,
    dest_project: str,
    dest_dataset: str,
    limit: int | None,
    dry_run: bool,
) -> None:
    src_fqn = f"`{SOURCE_PROJECT}.{SOURCE_DATASET}.{table}`"
    dest_fqn = f"`{dest_project}.{dest_dataset}.{table}`"

    select_clause = f"SELECT * FROM {src_fqn}"
    if limit:
        select_clause += f" LIMIT {int(limit)}"

    sql = f"CREATE OR REPLACE TABLE {dest_fqn} AS\n{select_clause}"

    print(f"\n[ProdSync] ── {table} ──")
    print(f"[ProdSync] SQL:\n{sql}\n")

    if dry_run:
        print(f"[ProdSync] Dry run — not executing.")
        return

    job = client.query(sql, project=dest_project)
    job.result()
    print(f"[ProdSync] CREATE OR REPLACE complete.")

    # Validation: row count
    count_sql = f"SELECT COUNT(*) AS cnt FROM {dest_fqn}"
    cnt = list(client.query(count_sql, project=dest_project).result())[0].cnt
    print(f"[ProdSync] {dest_project}.{dest_dataset}.{table} → {cnt:,} rows")


def main():
    parser = argparse.ArgumentParser(
        description="Mirror Adtalem prod R2C tables → Walden QA BigQuery."
    )
    parser.add_argument(
        "--dest-project",
        default=DEFAULT_DEST_PROJECT,
        help=f"Destination GCP project (default: {DEFAULT_DEST_PROJECT})",
    )
    parser.add_argument(
        "--dest-dataset",
        default=DEFAULT_DEST_DATASET,
        help=f"Destination BQ dataset (default: {DEFAULT_DEST_DATASET})",
    )
    parser.add_argument(
        "--tables",
        nargs="+",
        default=SOURCE_TABLES,
        choices=SOURCE_TABLES,
        help="Subset of tables to mirror (default: both).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit rows per table (smoke testing only).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print SQL without executing.",
    )
    args = parser.parse_args()

    print("=" * 70)
    print(f"Prod → QA BQ Sync — {datetime.now(timezone.utc).isoformat()}")
    print(f"Source : {SOURCE_PROJECT}.{SOURCE_DATASET}")
    print(f"Dest   : {args.dest_project}.{args.dest_dataset}")
    print(f"Tables : {', '.join(args.tables)}")
    if args.limit:
        print(f"Limit  : {args.limit} rows/table")
    print("=" * 70)

    # Single client — runner's ADC must have read on prod + write on QA.
    client = bigquery.Client(project=args.dest_project)

    if not args.dry_run:
        ensure_dataset(client, args.dest_project, args.dest_dataset)

    for tbl in args.tables:
        try:
            mirror_table(
                client=client,
                table=tbl,
                dest_project=args.dest_project,
                dest_dataset=args.dest_dataset,
                limit=args.limit,
                dry_run=args.dry_run,
            )
        except Exception as e:
            print(f"[ProdSync] ERROR mirroring {tbl}: {e}", file=sys.stderr)
            sys.exit(1)

    print("\n[ProdSync] All requested tables mirrored.")


if __name__ == "__main__":
    main()
