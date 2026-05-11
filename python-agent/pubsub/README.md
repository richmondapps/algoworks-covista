# Pub/Sub Sync — Dev v1

Event-driven mirror of the two R2C reporting tables from Adtalem source BQ
into our Walden dev project, via Pub/Sub topics with managed BigQuery
subscriptions landing into `_stream` tables.

## Target architecture

```
Client BQ ──► Your BQ ──► Pub/Sub Event ──► Subscriber ──► Auto Sync ──► Firebase ──► App
```

| Step | Concrete resource |
|---|---|
| **Client BQ** | `daas-cdw-dev.rpt_ai_solutions.t_wldn_r2c_student_profile` / `t_wldn_r2c_student_activity_log` |
| **Your BQ** | `dev-wu-agenticai-app-proj.covista_demo.t_wldn_r2c_*` (canonical, populated by `sync_*.py`) |
| **Pub/Sub Event** | Topics: `r2c-student-profile`, `r2c-student-activity-log` |
| **Subscriber** | BigQuery subscriptions: `*-bq-sub` → land into `*_stream` tables |
| **Auto Sync** | MERGE from `_stream` → canonical (Jake's loader, or v2 Cloud Function) |
| **Firebase** | Firestore docs Jake's reducer writes |
| **App** | Wally Insights UI (`qa-studentsuccessplan.waldenu.edu`) |

## v1 vs v2 scope

**v1 (this script — ready 5/5 for QA testing):**
- Publishes directly from Client BQ → Pub/Sub → BQ landing tables
- One fewer hop than the full diagram so we can prove the backbone fast
- Raw JSON payload + Pub/Sub metadata in landing tables
- No schema typing, no dead-letter, no scheduled trigger

**v2 (hardening, wrap by 5/15):**
- Publish from Your BQ instead of Client BQ (CDC trigger)
- Topic schemas + Avro/Proto for typed columns
- Dead-letter topic + alerts on subscription backlog
- IAM lockdown (publisher SA distinct from subscriber SA)
- Cloud Run job wrapper for publisher (replaces local cron)

## Quickstart

### One-time provisioning

```powershell
cd c:\covista\main\python-agent
pip install -r requirements.txt

# Auth — source (Walden BQ) and destination (Adtalem Pub/Sub + BQ) are
# usually different identities. Two options:
#
#  A) ADC for everything (works if your single ADC has access to both)
#       gcloud auth application-default login
#
#  B) Per-side OAuth user JSON files (recommended for the Walden ↔ Adtalem split):
#       $env:SOURCE_CREDENTIALS = "C:\path\to\walden_credentials.json"
#       $env:DEST_CREDENTIALS   = "C:\covista\main\python-agent\.adtalem_credentials.json"
#
#  Either file is the OAuth user JSON produced by
#  `gcloud auth application-default login` (lives at
#  %APPDATA%\gcloud\application_default_credentials.json on Windows).

# Create topics, subscriptions, landing tables
python pubsub/sync_pubsub_dev.py setup
```

The setup command prints two `gcloud` commands you must run **once** to
grant the Pub/Sub service agent permission to write into BigQuery:

```bash
gcloud projects add-iam-policy-binding dev-wu-agenticai-app-proj \
    --member=serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com \
    --role=roles/bigquery.dataEditor

gcloud projects add-iam-policy-binding dev-wu-agenticai-app-proj \
    --member=serviceAccount:service-<PROJECT_NUMBER>@gcp-sa-pubsub.iam.gserviceaccount.com \
    --role=roles/bigquery.metadataViewer
```

### Smoke test

```powershell
# Publish 5 sample rows per table
python pubsub/sync_pubsub_dev.py publish --limit 5

# Wait ~5 seconds, then peek at landing tables
python pubsub/sync_pubsub_dev.py tail
```

### Full publish

```powershell
python pubsub/sync_pubsub_dev.py publish
```

### Single table

```powershell
python pubsub/sync_pubsub_dev.py publish --tables t_wldn_r2c_student_profile
```

### Dev cleanup

```powershell
python pubsub/sync_pubsub_dev.py teardown --yes --drop-tables
```

## Resource inventory (dev)

| Type | Name |
|---|---|
| Topic | `projects/dev-wu-agenticai-app-proj/topics/r2c-student-profile` |
| Topic | `projects/dev-wu-agenticai-app-proj/topics/r2c-student-activity-log` |
| Subscription | `r2c-student-profile-bq-sub` |
| Subscription | `r2c-student-activity-log-bq-sub` |
| Landing table | `dev-wu-agenticai-app-proj.covista_demo.t_wldn_r2c_student_profile_stream` |
| Landing table | `dev-wu-agenticai-app-proj.covista_demo.t_wldn_r2c_student_activity_log_stream` |

## Landing table schema

Pub/Sub BQ subscription writes these columns (no topic schema, metadata on):

| Column | Type |
|---|---|
| `subscription_name` | STRING |
| `message_id` | STRING |
| `publish_time` | TIMESTAMP |
| `data` | STRING (JSON-encoded row) |
| `attributes` | STRING (JSON-encoded message attributes) |

Message attributes set by publisher:
- `source_table` = `t_wldn_r2c_student_profile` | `t_wldn_r2c_student_activity_log`
- `source_project` = `daas-cdw-dev`
- `published_at` = ISO-8601 UTC timestamp

## Downstream MERGE pattern (for Jake)

To land messages into the canonical table on a schedule:

```sql
MERGE `dev-wu-agenticai-app-proj.covista_demo.t_wldn_r2c_student_profile` T
USING (
  SELECT
    JSON_VALUE(data, '$.student_id')         AS student_id,
    JSON_VALUE(data, '$.term_code')          AS term_code,
    -- … rest of columns from JSON payload …
    publish_time                              AS _last_seen
  FROM `dev-wu-agenticai-app-proj.covista_demo.t_wldn_r2c_student_profile_stream`
  WHERE publish_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
) S
ON T.student_id = S.student_id AND T.term_code = S.term_code
WHEN MATCHED THEN UPDATE SET
  -- … column list …
  T._last_seen = S._last_seen
WHEN NOT MATCHED THEN INSERT (
  -- … column list …
) VALUES (…);
```

## Promotion to QA / prod

The script keys destination off `DEV_PUBSUB_PROJECT` env var (default
`dev-wu-agenticai-app-proj`). To run against QA:

```powershell
$env:DEV_PUBSUB_PROJECT = "qa-wu-agenticai-app-proj"
python pubsub/sync_pubsub_dev.py setup
```

Source project is hard-coded to `daas-cdw-dev` for v1 by design — flip
to `daas-cdw-qa` / `daas-cdw-prod` in the constants when QA / prod
turn-on lands. v2 will parameterize.

## Troubleshooting

**`PermissionDenied` when creating BQ subscription**
→ run the two `gcloud` IAM commands the setup step prints.

**Messages publish but nothing lands in BQ**
→ `gcloud pubsub subscriptions describe r2c-student-profile-bq-sub` —
check `bigqueryConfig.state`. If `PERMISSION_DENIED`, it's the same
IAM issue.

**Dataset not found**
→ setup creates it; if you ran setup against the wrong project, check
`$env:DEV_PUBSUB_PROJECT`.
