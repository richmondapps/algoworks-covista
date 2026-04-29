"""Trace the lineage of fafsa_submission_flag and received_fafsa_application_c.

Apr 27 2026 — Alpesh's screenshot showed `received_fafsa_application_c BOOLEAN`
in his BQ. We expose `fafsa_submission_flag` in the activity log view. This
script confirms whether they are the same column under different names or
distinct fields, by scanning rpt_ai_solutions INFORMATION_SCHEMA + sampling rows.
"""

import google.auth
from google.cloud import bigquery


def main():
    creds, _ = google.auth.default()
    bq = bigquery.Client(project="daas-cdw-dev", credentials=creds)

    print("\n=== 1) All rpt_ai_solutions columns matching 'fafsa' ===")
    q1 = """
    SELECT table_name, column_name, data_type
    FROM `daas-cdw-dev.rpt_ai_solutions.INFORMATION_SCHEMA.COLUMNS`
    WHERE LOWER(column_name) LIKE '%fafsa%'
    ORDER BY table_name, column_name
    """
    for r in bq.query(q1).result():
        print(f"  {r.table_name}.{r.column_name} :: {r.data_type}")

    print("\n=== 2) All columns ending in '_c' (Salesforce custom-field convention) in rpt_ai_solutions ===")
    q2 = """
    SELECT table_name, column_name, data_type
    FROM `daas-cdw-dev.rpt_ai_solutions.INFORMATION_SCHEMA.COLUMNS`
    WHERE column_name LIKE '%fafsa%_c' OR column_name LIKE '%application_c'
    ORDER BY table_name, column_name
    """
    for r in bq.query(q2).result():
        print(f"  {r.table_name}.{r.column_name} :: {r.data_type}")

    print("\n=== 3) Distinct fafsa_submission_flag values on FAFSA-related rows ===")
    q3 = """
    SELECT activity_name, fafsa_submission_flag, COUNT(*) AS cnt
    FROM `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`
    WHERE activity_name IN ('fafsa_submission', 'alternate_funding_submission')
    GROUP BY activity_name, fafsa_submission_flag
    ORDER BY activity_name, fafsa_submission_flag
    """
    for r in bq.query(q3).result():
        print(f"  {r.activity_name} | flag={r.fafsa_submission_flag} | rows={r.cnt}")

    print("\n=== 4) Search ALL accessible datasets for 'received_fafsa_application' ===")
    # Project-wide INFORMATION_SCHEMA queries require region-qualified path
    for region in ("region-us",):
        q4 = f"""
        SELECT table_schema, table_name, column_name, data_type
        FROM `daas-cdw-dev.{region}.INFORMATION_SCHEMA.COLUMNS`
        WHERE LOWER(column_name) LIKE '%received_fafsa%'
           OR LOWER(column_name) LIKE '%fafsa_submission_flag%'
        ORDER BY table_schema, table_name, column_name
        """
        try:
            print(f"  -- region: {region} --")
            for r in bq.query(q4).result():
                print(
                    f"  {r.table_schema}.{r.table_name}.{r.column_name} :: {r.data_type}"
                )
        except Exception as e:
            print(f"  ({region}) skipped: {e}")


if __name__ == "__main__":
    main()
