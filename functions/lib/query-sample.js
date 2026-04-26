"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bigquery_1 = require("@google-cloud/bigquery");
const bq = new bigquery_1.BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });
const DATASET = 'covista_demo';
async function fetchSample() {
    console.log('Fetching sample 10 students from BigQuery...');
    try {
        // 1. Fetch exactly 10 Student Cores
        const [coreRows] = await bq.query(`SELECT * FROM \`algoworks-dev.${DATASET}.student_core\` LIMIT 1`);
        if (!coreRows || coreRows.length === 0) {
            console.log('No records found in student_core.');
            return;
        }
        console.log("SUCCESS! Row schema:");
        console.log(JSON.stringify(coreRows[0], null, 2));
        return;
        /*
        // Group the relational data into a structured JSON
        const output = coreRows.map((student: any) => ({
            core: student,
            courses: courses.filter((c: any) => c.student_id === student.student_id),
            contingencies: contingencies.filter((c: any) => c.student_id === student.student_id),
            activityLogs: logs.filter((l: any) => l.student_id === student.student_id)
        }));

        fs.writeFileSync('sample_10_students.json', JSON.stringify(output, null, 2));
        console.log('✅ Successfully extracted 10 full student records to sample_10_students.json!');
        */
    }
    catch (error) {
        console.error('Failed to pull from BigQuery:', error);
    }
}
fetchSample();
//# sourceMappingURL=query-sample.js.map