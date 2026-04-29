"""
FAFSA data audit — verify boolean value + ability to identify the submission record.

Checks:
1. In activity log: fafsa_submission event count, boolean field types/values
   (fafsa_interest_in_federal_aid, fafsa_intend_to_fund)
2. Sample fafsa_submission rows
3. How to uniquely identify the FAFSA submission record (log_id + student + date)
"""
import csv
from datetime import datetime, timezone
from pathlib import Path
from google.cloud import bigquery

SRC_LOG = "`daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`"

SCHEMA_QUERY = f"""
SELECT column_name, data_type, is_nullable
FROM `daas-cdw-dev.rpt_ai_solutions.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'wldn_r2c_student_activity_log'
  AND (LOWER(column_name) LIKE '%fafsa%' OR LOWER(column_name) LIKE '%funding%')
ORDER BY ordinal_position
"""

COUNT_QUERY = f"""
SELECT
  activity_name,
  COUNT(*) AS row_count,
  COUNT(DISTINCT student_id) AS distinct_students,
  COUNTIF(fafsa_interest_in_federal_aid IS NULL) AS null_interest,
  COUNTIF(fafsa_intend_to_fund IS NULL) AS null_intend,
  MIN(activity_datetime) AS first_seen,
  MAX(activity_datetime) AS last_seen
FROM {SRC_LOG}
WHERE activity_name = 'fafsa_submission'
GROUP BY activity_name
"""

VALUE_DIST_QUERY = f"""
SELECT
  CAST(fafsa_interest_in_federal_aid AS STRING) AS interest_val,
  CAST(fafsa_intend_to_fund AS STRING) AS intend_val,
  COUNT(*) AS row_count
FROM {SRC_LOG}
WHERE activity_name = 'fafsa_submission'
GROUP BY 1, 2
ORDER BY row_count DESC
"""

SAMPLE_QUERY = f"""
SELECT
  log_id,
  student_id,
  activity_category,
  activity_name,
  activity_datetime,
  actor,
  fafsa_interest_in_federal_aid,
  fafsa_intend_to_fund
FROM {SRC_LOG}
WHERE activity_name = 'fafsa_submission'
ORDER BY activity_datetime DESC
LIMIT 20
"""

DUPLICATE_QUERY = f"""
SELECT student_id, COUNT(*) AS fafsa_events
FROM {SRC_LOG}
WHERE activity_name = 'fafsa_submission'
GROUP BY student_id
HAVING COUNT(*) > 1
ORDER BY fafsa_events DESC
LIMIT 10
"""

out_dir = Path("query_outputs")
out_dir.mkdir(exist_ok=True)
ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

client = bigquery.Client(project="daas-cdw-dev")

print("1. Schema of FAFSA/funding columns...")
schema = list(client.query(SCHEMA_QUERY).result())

print("2. FAFSA event count...")
count = list(client.query(COUNT_QUERY).result())

print("3. Value distribution...")
values = list(client.query(VALUE_DIST_QUERY).result())

print("4. Sample rows...")
samples = list(client.query(SAMPLE_QUERY).result())

print("5. Duplicate FAFSA events per student...")
dupes = list(client.query(DUPLICATE_QUERY).result())

out_txt = out_dir / f"fafsa_audit_{ts}.txt"
out_samples_csv = out_dir / f"fafsa_sample_rows_{ts}.csv"

with out_samples_csv.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["log_id", "student_id", "activity_category", "activity_name",
                "activity_datetime", "actor", "fafsa_interest_in_federal_aid",
                "fafsa_intend_to_fund"])
    for r in samples:
        w.writerow([r.log_id, r.student_id, r.activity_category, r.activity_name,
                    r.activity_datetime, r.actor,
                    r.fafsa_interest_in_federal_aid, r.fafsa_intend_to_fund])

with out_txt.open("w", encoding="utf-8") as f:
    f.write("FAFSA DATA AUDIT\n")
    f.write(f"Source: {SRC_LOG}\n")
    f.write(f"Run: {ts} UTC\n\n")

    f.write("=" * 80 + "\n")
    f.write("1. SCHEMA — fafsa/funding columns\n")
    f.write("=" * 80 + "\n")
    f.write(f"{'column_name':45} {'data_type':15} {'nullable':10}\n")
    for r in schema:
        f.write(f"{r.column_name:45} {r.data_type:15} {r.is_nullable:10}\n")
    f.write("\n")

    f.write("=" * 80 + "\n")
    f.write("2. FAFSA_SUBMISSION EVENT COUNT\n")
    f.write("=" * 80 + "\n")
    for r in count:
        f.write(f"activity_name:        {r.activity_name}\n")
        f.write(f"rows:                 {r.row_count}\n")
        f.write(f"distinct students:    {r.distinct_students}\n")
        f.write(f"null interest flag:   {r.null_interest}\n")
        f.write(f"null intend flag:     {r.null_intend}\n")
        f.write(f"first_seen:           {r.first_seen}\n")
        f.write(f"last_seen:            {r.last_seen}\n")
    f.write("\n")

    f.write("=" * 80 + "\n")
    f.write("3. VALUE DISTRIBUTION (fafsa_interest_in_federal_aid, fafsa_intend_to_fund)\n")
    f.write("=" * 80 + "\n")
    f.write(f"{'interest':20} {'intend':20} {'rows':>8}\n")
    f.write("-" * 60 + "\n")
    for r in values:
        f.write(f"{str(r.interest_val):20} {str(r.intend_val):20} {r.row_count:>8}\n")
    f.write("\n")

    f.write("=" * 80 + "\n")
    f.write("4. SAMPLE ROWS (top 20 most recent fafsa_submission events)\n")
    f.write("=" * 80 + "\n")
    for r in samples:
        f.write(f"log_id={r.log_id} student={r.student_id} date={r.activity_datetime} "
                f"interest={r.fafsa_interest_in_federal_aid} intend={r.fafsa_intend_to_fund} "
                f"actor={r.actor}\n")
    f.write("\n")

    f.write("=" * 80 + "\n")
    f.write("5. STUDENTS WITH MULTIPLE FAFSA SUBMISSION EVENTS\n")
    f.write("=" * 80 + "\n")
    if not dupes:
        f.write("(none — each student has at most 1 fafsa_submission row)\n")
    else:
        for r in dupes:
            f.write(f"student_id={r.student_id} events={r.fafsa_events}\n")
    f.write("\n")

print(f"\nTXT:  {out_txt.resolve()}")
print(f"CSV:  {out_samples_csv.resolve()}\n")
print(out_txt.read_text(encoding="utf-8"))
