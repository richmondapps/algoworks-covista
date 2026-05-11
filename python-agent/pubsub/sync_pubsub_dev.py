"""
Pub/Sub Sync — Dev v1
=====================

Pub/Sub-based sync from Adtalem dev BQ → Walden dev BQ.

Architecture (dev v1):

    daas-cdw-dev.rpt_ai_solutions.t_wldn_r2c_student_profile          (source)
    daas-cdw-dev.rpt_ai_solutions.t_wldn_r2c_student_activity_log     (source)
                            │
                            │  publisher (this script: `publish` cmd)
                            │  reads rows, emits JSON messages
                            ▼
    Pub/Sub topics on dev-wu-agenticai-app-proj
        - r2c-student-profile
        - r2c-student-activity-log
                            │
                            │  BigQuery subscriptions (managed by Pub/Sub)
                            │  use_topic_schema=False, write_metadata=True
                            ▼
    dev-wu-agenticai-app-proj.covista_demo
        - t_wldn_r2c_student_profile_stream      (raw landing)
        - t_wldn_r2c_student_activity_log_stream (raw landing)

Why this shape (v1, ready for QA testing tomorrow):
  • Simple JSON-payload landing tables — no schema-drift fights.
  • BQ subscription handles delivery + retry + ordering for free.
  • Downstream (Jake) can MERGE from `_stream` into the canonical
    t_wldn_r2c_*  tables on a schedule, OR consume directly.

Hardening (v2 — wrap by 5/15):
  • Topic schemas + Avro/Proto for typed columns.
  • Dead-letter topic + alerts on subscription backlog.
  • IAM lockdown (publisher SA distinct from subscriber SA).
  • CDC trigger from source instead of full-table polling.
  • Cloud Run job wrapper for publisher (replaces local cron).

USAGE
-----
  # 1. Provision topics + BQ subscriptions + landing tables (idempotent)
  python sync_pubsub_dev.py setup

  # 2. Publish a batch of rows from source to topics (Jake's QA test driver)
  python sync_pubsub_dev.py publish --limit 10
  python sync_pubsub_dev.py publish                    # all rows
  python sync_pubsub_dev.py publish --tables t_wldn_r2c_student_profile

  # 3. Tail landing tables to confirm messages are arriving
  python sync_pubsub_dev.py tail --limit 5

  # 4. Optional: tear everything down (dev cleanup only)
  python sync_pubsub_dev.py teardown

AUTH REQUIREMENTS (runner ADC)
------------------------------
  Source (daas-cdw-dev):
    - bigquery.tables.getData       (read source rows)
    - bigquery.jobs.create          (run SELECT)
  Destination (dev-wu-agenticai-app-proj):
    - pubsub.topics.{create,publish,delete,get}
    - pubsub.subscriptions.{create,delete,get}
    - bigquery.datasets.create / bigquery.tables.create
    - bigquery.tables.updateData   (BQ subscription writes use the
                                    Pub/Sub service account — see setup notes)

  After `setup` runs once, the BQ subscription's writer identity
  (service-PROJECT_NUMBER@gcp-sa-pubsub.iam.gserviceaccount.com) needs
  roles/bigquery.dataEditor on the dataset. The setup step prints the
  exact `gcloud` command needed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Iterable

from google.api_core import exceptions as gax
from google.cloud import bigquery, pubsub_v1
from google.oauth2.credentials import Credentials


# ── Source (Adtalem dev — read-only) ───────────────────────────────────
SOURCE_PROJECT = "daas-cdw-dev"
SOURCE_DATASET = "rpt_ai_solutions"

# ── Destination (Walden dev) ───────────────────────────────────────────
DEST_PROJECT = os.environ.get("DEV_PUBSUB_PROJECT", "dev-wu-agenticai-app-proj")
DEST_DATASET = "covista_demo"


# ── Credential helpers ─────────────────────────────────────────────────
# Source (daas-cdw-dev) is gated to a Walden identity; destination
# (dev/qa-wu-agenticai-app-proj) is gated to an Adtalem identity. They
# are usually different users, so we let each be loaded independently:
#
#   SOURCE_CREDENTIALS  — path to OAuth user JSON for Walden source reads
#                         (default: fall back to ADC)
#   DEST_CREDENTIALS    — path to OAuth user JSON for Adtalem destination
#                         (default: fall back to ADC)
#
# If both are unset the script behaves as before.
def _load_creds(env_var: str, quota_project: str | None = None):
    path = os.environ.get(env_var)
    if not path:
        return None
    with open(path) as f:
        info = json.load(f)
    creds = Credentials.from_authorized_user_info(info)
    if quota_project:
        try:
            creds = creds.with_quota_project(quota_project)
        except Exception:
            pass
    return creds


def _source_creds():
    return _load_creds("SOURCE_CREDENTIALS", quota_project=SOURCE_PROJECT)


def _dest_creds():
    return _load_creds("DEST_CREDENTIALS", quota_project=DEST_PROJECT)

# ── Table → topic → landing table mapping ──────────────────────────────
TABLES = {
    "t_wldn_r2c_student_profile": {
        "topic": "r2c-student-profile",
        "subscription": "r2c-student-profile-bq-sub",
        "landing_table": "t_wldn_r2c_student_profile_stream",
    },
    "t_wldn_r2c_student_activity_log": {
        "topic": "r2c-student-activity-log",
        "subscription": "r2c-student-activity-log-bq-sub",
        "landing_table": "t_wldn_r2c_student_activity_log_stream",
    },
}

# Landing table schema for v1 (raw JSON payload + Pub/Sub metadata).
# Pub/Sub BQ subscription writes these columns when use_topic_schema=False
# and write_metadata=True.
LANDING_SCHEMA = [
    bigquery.SchemaField("subscription_name", "STRING"),
    bigquery.SchemaField("message_id", "STRING"),
    bigquery.SchemaField("publish_time", "TIMESTAMP"),
    bigquery.SchemaField("data", "STRING"),
    bigquery.SchemaField("attributes", "STRING"),
]


# ════════════════════════════════════════════════════════════════════════
# helpers
# ════════════════════════════════════════════════════════════════════════
def _serialize(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (date, time)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return v


def _row_to_message(row: dict) -> bytes:
    return json.dumps({k: _serialize(v) for k, v in row.items()}).encode("utf-8")


def _topic_path(project: str, topic: str) -> str:
    return pubsub_v1.PublisherClient.topic_path(project, topic)


def _sub_path(project: str, sub: str) -> str:
    return pubsub_v1.SubscriberClient.subscription_path(project, sub)


def _landing_fqn(table_cfg: dict) -> str:
    return f"{DEST_PROJECT}.{DEST_DATASET}.{table_cfg['landing_table']}"


# ════════════════════════════════════════════════════════════════════════
# setup — provision topics, BQ landing tables, subscriptions
# ════════════════════════════════════════════════════════════════════════
def cmd_setup(args: argparse.Namespace) -> None:
    print("=" * 70)
    print(f"Pub/Sub Sync — SETUP @ {datetime.now(timezone.utc).isoformat()}")
    print(f"Dest project : {DEST_PROJECT}")
    print(f"Dest dataset : {DEST_DATASET}")
    print("=" * 70)

    dc = _dest_creds()
    bq = bigquery.Client(project=DEST_PROJECT, credentials=dc)
    publisher = pubsub_v1.PublisherClient(credentials=dc)
    subscriber = pubsub_v1.SubscriberClient(credentials=dc)

    # 1. Dataset
    ds_ref = bigquery.DatasetReference(DEST_PROJECT, DEST_DATASET)
    try:
        bq.get_dataset(ds_ref)
        print(f"[setup] Dataset OK: {DEST_PROJECT}.{DEST_DATASET}")
    except gax.NotFound:
        bq.create_dataset(bigquery.Dataset(ds_ref), exists_ok=True)
        print(f"[setup] Dataset CREATED: {DEST_PROJECT}.{DEST_DATASET}")

    # 2. Per-table: topic, landing table, subscription
    for table, cfg in TABLES.items():
        if args.tables and table not in args.tables:
            continue

        print(f"\n[setup] ── {table} ──")

        # 2a. topic
        topic_path = _topic_path(DEST_PROJECT, cfg["topic"])
        try:
            publisher.create_topic(request={"name": topic_path})
            print(f"[setup]   topic CREATED:        {topic_path}")
        except gax.AlreadyExists:
            print(f"[setup]   topic OK:             {topic_path}")

        # 2b. landing table
        tbl_fqn = _landing_fqn(cfg)
        tbl_ref = bigquery.Table(tbl_fqn, schema=LANDING_SCHEMA)
        try:
            bq.get_table(tbl_fqn)
            print(f"[setup]   landing table OK:     {tbl_fqn}")
        except gax.NotFound:
            bq.create_table(tbl_ref)
            print(f"[setup]   landing table CREATED:{tbl_fqn}")

        # 2c. BigQuery subscription
        sub_path = _sub_path(DEST_PROJECT, cfg["subscription"])
        bq_config = pubsub_v1.types.BigQueryConfig(
            table=f"{DEST_PROJECT}.{DEST_DATASET}.{cfg['landing_table']}",
            use_topic_schema=False,
            write_metadata=True,
            drop_unknown_fields=False,
        )
        try:
            subscriber.create_subscription(
                request={
                    "name": sub_path,
                    "topic": topic_path,
                    "bigquery_config": bq_config,
                    "ack_deadline_seconds": 60,
                }
            )
            print(f"[setup]   BQ subscription CREATED: {sub_path}")
        except gax.AlreadyExists:
            print(f"[setup]   BQ subscription OK:      {sub_path}")
        except gax.PermissionDenied as e:
            print(f"[setup]   BQ subscription FAILED — see IAM note below:")
            print(f"           {e.message}")

    # 3. IAM hint — Pub/Sub service agent needs BQ writer role
    project_number = _get_project_number(DEST_PROJECT)
    if project_number:
        ps_sa = f"service-{project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
        print("\n" + "─" * 70)
        print("[setup] IAM REQUIRED for BQ subscriptions to write:")
        print(
            f"  gcloud projects add-iam-policy-binding {DEST_PROJECT} \\\n"
            f"      --member=serviceAccount:{ps_sa} \\\n"
            f"      --role=roles/bigquery.dataEditor"
        )
        print(
            f"  gcloud projects add-iam-policy-binding {DEST_PROJECT} \\\n"
            f"      --member=serviceAccount:{ps_sa} \\\n"
            f"      --role=roles/bigquery.metadataViewer"
        )
        print("─" * 70)

    print("\n[setup] Done.")


def _get_project_number(project_id: str) -> str | None:
    try:
        from google.cloud import resourcemanager_v3

        client = resourcemanager_v3.ProjectsClient(credentials=_dest_creds())
        proj = client.get_project(name=f"projects/{project_id}")
        return proj.name.split("/")[-1]
    except Exception:
        return None


# ════════════════════════════════════════════════════════════════════════
# publish — read source rows, emit messages
# ════════════════════════════════════════════════════════════════════════
def cmd_publish(args: argparse.Namespace) -> None:
    print("=" * 70)
    print(f"Pub/Sub Sync — PUBLISH @ {datetime.now(timezone.utc).isoformat()}")
    print(f"Source : {SOURCE_PROJECT}.{SOURCE_DATASET}")
    print(f"Dest   : projects/{DEST_PROJECT}/topics/...")
    if args.limit:
        print(f"Limit  : {args.limit} rows/table")
    print("=" * 70)

    bq = bigquery.Client(project=SOURCE_PROJECT, credentials=_source_creds())
    publisher = pubsub_v1.PublisherClient(credentials=_dest_creds())
    publish_ts = datetime.now(timezone.utc).isoformat()

    for table, cfg in TABLES.items():
        if args.tables and table not in args.tables:
            continue

        print(f"\n[publish] ── {table} ──")
        topic_path = _topic_path(DEST_PROJECT, cfg["topic"])

        sql = f"SELECT * FROM `{SOURCE_PROJECT}.{SOURCE_DATASET}.{table}`"
        if args.limit:
            sql += f" LIMIT {int(args.limit)}"

        rows = list(bq.query(sql).result())
        print(f"[publish]   fetched {len(rows):,} rows from source")

        futures = []
        for row in rows:
            data = _row_to_message(dict(row.items()))
            future = publisher.publish(
                topic_path,
                data=data,
                source_table=table,
                source_project=SOURCE_PROJECT,
                published_at=publish_ts,
            )
            futures.append(future)

        # wait for ack
        for f in futures:
            f.result(timeout=60)

        print(f"[publish]   published {len(futures):,} messages → {topic_path}")

    print("\n[publish] Done. BQ subscriptions will land messages within seconds.")


# ════════════════════════════════════════════════════════════════════════
# tail — peek at landing tables
# ════════════════════════════════════════════════════════════════════════
def cmd_tail(args: argparse.Namespace) -> None:
    bq = bigquery.Client(project=DEST_PROJECT, credentials=_dest_creds())
    print("=" * 70)
    print(f"Pub/Sub Sync — TAIL @ {datetime.now(timezone.utc).isoformat()}")
    print("=" * 70)

    for table, cfg in TABLES.items():
        if args.tables and table not in args.tables:
            continue

        fqn = _landing_fqn(cfg)
        print(f"\n[tail] ── {fqn} ──")
        try:
            sql = (
                f"SELECT message_id, publish_time, "
                f"SUBSTR(data, 1, 200) AS data_preview "
                f"FROM `{fqn}` "
                f"ORDER BY publish_time DESC "
                f"LIMIT {int(args.limit)}"
            )
            for row in bq.query(sql).result():
                print(
                    f"  {row.publish_time}  {row.message_id}  {row.data_preview!r}"
                )
        except Exception as e:
            print(f"[tail]   ERROR: {e}")


# ════════════════════════════════════════════════════════════════════════
# teardown — dev-only cleanup
# ════════════════════════════════════════════════════════════════════════
def cmd_teardown(args: argparse.Namespace) -> None:
    if not args.yes:
        print("teardown is destructive — re-run with --yes to confirm.")
        sys.exit(2)

    dc = _dest_creds()
    publisher = pubsub_v1.PublisherClient(credentials=dc)
    subscriber = pubsub_v1.SubscriberClient(credentials=dc)
    bq = bigquery.Client(project=DEST_PROJECT, credentials=dc)

    for table, cfg in TABLES.items():
        if args.tables and table not in args.tables:
            continue
        print(f"\n[teardown] ── {table} ──")

        sub_path = _sub_path(DEST_PROJECT, cfg["subscription"])
        try:
            subscriber.delete_subscription(request={"subscription": sub_path})
            print(f"[teardown]   subscription DELETED: {sub_path}")
        except gax.NotFound:
            print(f"[teardown]   subscription absent:  {sub_path}")

        topic_path = _topic_path(DEST_PROJECT, cfg["topic"])
        try:
            publisher.delete_topic(request={"topic": topic_path})
            print(f"[teardown]   topic DELETED:        {topic_path}")
        except gax.NotFound:
            print(f"[teardown]   topic absent:         {topic_path}")

        if args.drop_tables:
            fqn = _landing_fqn(cfg)
            try:
                bq.delete_table(fqn)
                print(f"[teardown]   landing table DROPPED:{fqn}")
            except gax.NotFound:
                pass


# ════════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════════
def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    sub = p.add_subparsers(dest="cmd", required=True)

    # common --tables option helper
    def _add_tables(sp):
        sp.add_argument(
            "--tables",
            nargs="+",
            choices=list(TABLES.keys()),
            help="Subset of tables to operate on (default: all).",
        )

    # setup
    sp = sub.add_parser("setup", help="Create topics, landing tables, BQ subs.")
    _add_tables(sp)
    sp.set_defaults(func=cmd_setup)

    # publish
    sp = sub.add_parser("publish", help="Read source rows and publish to topics.")
    _add_tables(sp)
    sp.add_argument("--limit", type=int, default=None,
                    help="Max rows to publish per table (smoke test).")
    sp.set_defaults(func=cmd_publish)

    # tail
    sp = sub.add_parser("tail", help="Peek at landing tables.")
    _add_tables(sp)
    sp.add_argument("--limit", type=int, default=5,
                    help="Rows to show per table (default 5).")
    sp.set_defaults(func=cmd_tail)

    # teardown
    sp = sub.add_parser("teardown", help="Delete subs/topics (dev-only).")
    _add_tables(sp)
    sp.add_argument("--yes", action="store_true", help="Confirm destructive op.")
    sp.add_argument("--drop-tables", action="store_true",
                    help="Also drop landing tables.")
    sp.set_defaults(func=cmd_teardown)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
