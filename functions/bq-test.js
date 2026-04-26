const { BigQuery } = require('@google-cloud/bigquery');
const bq = new BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });

async function check() {
    const [rows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.covista_demo.student_contingencies\` LIMIT 1`);
    console.log(rows);
}
check().catch(console.error);
