import csv
from datetime import datetime, timezone
from pathlib import Path
from google.cloud import bigquery

QUERY = '''
SELECT
    student_id,
    student_name,
    status_stage,
    reserve_date
FROM
    `daas-cdw-dev.rpt_ai_solutions.wldn_r2c_student_profile`
WHERE
    status_stage != 'Reserved'
    AND reserve_date IS NOT NULL
ORDER BY
    reserve_date DESC
LIMIT 100
'''

out_dir = Path('query_outputs')
out_dir.mkdir(exist_ok=True)
ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')

client = bigquery.Client(project='daas-cdw-dev')
rows = list(client.query(QUERY).result())

csv_path = out_dir / f'non_reserved_with_reserve_date_{ts}.csv'
txt_path = out_dir / f'non_reserved_with_reserve_date_{ts}.txt'

with csv_path.open('w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['student_id', 'student_name', 'status_stage', 'reserve_date'])
    for r in rows:
        writer.writerow([r.student_id, r.student_name, r.status_stage, r.reserve_date])

with txt_path.open('w', encoding='utf-8') as f:
    f.write('Query: non-Reserved students having reserve_date\n')
    f.write(f'Rows returned: {len(rows)}\n\n')
    f.write('student_id | student_name | status_stage | reserve_date\n')
    f.write('-' * 100 + '\n')
    for r in rows:
        f.write(f"{r.student_id} | {r.student_name} | {r.status_stage} | {r.reserve_date}\n")

print(f'Rows returned: {len(rows)}')
print(f'CSV saved: {csv_path.resolve()}')
print(f'TXT saved: {txt_path.resolve()}')
