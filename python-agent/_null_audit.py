from google.cloud import bigquery
c = bigquery.Client(project='daas-cdw-dev')
q = """
SELECT activity_name,
       COUNT(*) AS total,
       COUNTIF(activity_datetime IS NULL) AS null_dt,
       COUNTIF(actor IS NULL) AS null_actor
FROM `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_activity_log`
GROUP BY activity_name
ORDER BY total DESC
"""
for r in c.query(q).result():
    print(f"{r.activity_name:35} total={r.total:>7}  null_datetime={r.null_dt:>7}  null_actor={r.null_actor:>7}")
