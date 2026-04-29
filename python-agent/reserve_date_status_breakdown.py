"""
Breakdown of students with reserve_date grouped by status_stage.
For Manvitha's story: identifies where reserve_date exists on students
whose status is NOT 'Reserved' (e.g. Denied, Admitted, etc.)
"""
import csv
from datetime import datetime, timezone
from pathlib import Path
from google.cloud import bigquery

SOURCE = "`daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_profile`"

BREAKDOWN_QUERY = f"""
SELECT
    status_stage,
    COUNT(*) AS total_students,
    COUNTIF(reserve_date IS NOT NULL) AS has_reserve_date,
    COUNTIF(reserve_date IS NULL) AS no_reserve_date,
    ROUND(SAFE_DIVIDE(COUNTIF(reserve_date IS NOT NULL), COUNT(*)) * 100, 1) AS pct_with_reserve_date
FROM {SOURCE}
GROUP BY status_stage
ORDER BY has_reserve_date DESC
"""

DENIED_SAMPLES_QUERY = f"""
SELECT
    student_id,
    student_name,
    status_stage,
    reserve_date,
    program_start_date,
    census_date,
    last_updated_at
FROM {SOURCE}
WHERE status_stage = 'Denied'
  AND reserve_date IS NOT NULL
ORDER BY reserve_date DESC
LIMIT 25
"""

out_dir = Path("query_outputs")
out_dir.mkdir(exist_ok=True)
ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

client = bigquery.Client(project="daas-cdw-dev")

print("Running status_stage breakdown...")
breakdown = list(client.query(BREAKDOWN_QUERY).result())

print("Running 'Denied' sample query...")
denied = list(client.query(DENIED_SAMPLES_QUERY).result())

# Write breakdown
breakdown_csv = out_dir / f"reserve_date_by_status_{ts}.csv"
with breakdown_csv.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["status_stage", "total_students", "has_reserve_date",
                "no_reserve_date", "pct_with_reserve_date"])
    for r in breakdown:
        w.writerow([r.status_stage, r.total_students, r.has_reserve_date,
                    r.no_reserve_date, r.pct_with_reserve_date])

# Write denied samples
denied_csv = out_dir / f"denied_with_reserve_date_{ts}.csv"
with denied_csv.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["student_id", "student_name", "status_stage", "reserve_date",
                "program_start_date", "census_date", "last_updated_at"])
    for r in denied:
        w.writerow([r.student_id, r.student_name, r.status_stage, r.reserve_date,
                    r.program_start_date, r.census_date, r.last_updated_at])

# Human-readable summary
summary_txt = out_dir / f"reserve_date_audit_summary_{ts}.txt"
with summary_txt.open("w", encoding="utf-8") as f:
    f.write("RESERVE_DATE vs STATUS_STAGE AUDIT\n")
    f.write(f"Source: {SOURCE}\n")
    f.write(f"Run: {ts} UTC\n\n")

    f.write("=" * 90 + "\n")
    f.write("BREAKDOWN BY STATUS_STAGE\n")
    f.write("=" * 90 + "\n")
    f.write(f"{'status_stage':40} {'total':>8} {'has_rd':>8} {'no_rd':>8} {'pct':>6}\n")
    f.write("-" * 90 + "\n")
    total_all = 0
    total_with_rd = 0
    for r in breakdown:
        total_all += r.total_students
        total_with_rd += r.has_reserve_date
        f.write(f"{(r.status_stage or 'NULL'):40} "
                f"{r.total_students:>8} {r.has_reserve_date:>8} "
                f"{r.no_reserve_date:>8} {str(r.pct_with_reserve_date) + '%':>6}\n")
    f.write("-" * 90 + "\n")
    f.write(f"{'TOTAL':40} {total_all:>8} {total_with_rd:>8}\n\n")

    f.write("=" * 90 + "\n")
    f.write(f"DENIED STUDENTS WITH RESERVE_DATE (sample, top 25 by reserve_date desc)\n")
    f.write("=" * 90 + "\n")
    f.write(f"Total rows in sample: {len(denied)}\n\n")
    f.write(f"{'student_id':12} {'name':30} {'status':10} {'reserve_date':14} "
            f"{'program_start':14} {'last_updated':20}\n")
    f.write("-" * 110 + "\n")
    for r in denied:
        f.write(f"{r.student_id:12} {(r.student_name or '')[:30]:30} "
                f"{r.status_stage:10} {str(r.reserve_date):14} "
                f"{str(r.program_start_date):14} {str(r.last_updated_at)[:19]:20}\n")

print(f"\nBreakdown CSV: {breakdown_csv.resolve()}")
print(f"Denied samples CSV: {denied_csv.resolve()}")
print(f"Summary TXT: {summary_txt.resolve()}")
print("\n--- SUMMARY ---")
print(summary_txt.read_text(encoding="utf-8"))
