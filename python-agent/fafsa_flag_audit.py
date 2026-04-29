"""Quick profile of new fafsa_submission_flag column in source activity log."""
from google.cloud import bigquery

c = bigquery.Client(project='daas-cdw-dev')
TABLE = 'daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log'

q1 = f"""
SELECT
  activity_name,
  COUNT(*) AS row_count,
  COUNTIF(fafsa_submission_flag IS TRUE) AS flag_true,
  COUNTIF(fafsa_submission_flag IS FALSE) AS flag_false,
  COUNTIF(fafsa_submission_flag IS NULL) AS flag_null,
  COUNT(DISTINCT student_id) AS distinct_students
FROM `{TABLE}`
WHERE activity_name IN ('fafsa_submission', 'alternate_funding_submission')
GROUP BY activity_name
ORDER BY activity_name
"""

q2 = f"""
SELECT
  COUNT(*) AS total,
  COUNTIF(fafsa_submission_flag IS TRUE) AS flag_true,
  COUNTIF(fafsa_submission_flag IS FALSE) AS flag_false,
  COUNTIF(fafsa_submission_flag IS NULL) AS flag_null
FROM `{TABLE}`
"""

q3 = f"""
SELECT
  fafsa_submission_flag,
  fafsa_interest_in_federal_aid,
  COUNT(*) AS rows
FROM `{TABLE}`
WHERE activity_name IN ('fafsa_submission', 'alternate_funding_submission')
GROUP BY 1, 2
ORDER BY 1, 2
"""

print("=== By activity_name ===")
for r in c.query(q1).result():
    print(" ", dict(r))

print("\n=== Overall (all 798K rows) ===")
for r in c.query(q2).result():
    print(" ", dict(r))

print("\n=== flag x interest cross-tab (FAFSA-related rows only) ===")
for r in c.query(q3).result():
    print(" ", dict(r))
