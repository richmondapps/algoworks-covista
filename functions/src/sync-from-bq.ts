import { BigQuery } from '@google-cloud/bigquery';
import * as admin from 'firebase-admin';

// Initialize SDKs natively on Application Default Credentials
admin.initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });
const db = admin.firestore();
const bq = new BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });

const DATASET = 'covista_demo';

async function syncBigQuery() {
    console.log('[Node Ingester] Fetching BigQuery Tables...');

    // 1. Fetch Courses
    const [courses] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_courses\``);
    const courseMap: any = {};
    for (const row of courses) {
        if (!courseMap[row.student_id]) courseMap[row.student_id] = [];
        courseMap[row.student_id].push({
            courseId: row.course_id,
            isAccredited: row.is_accredited,
            registrationStatus: row.course_registration_status,
            firstLoginAt: row.first_login_at?.value || null,
            firstDiscussionPostAt: row.first_discussion_post_at?.value || null
        });
    }

    // 2. Fetch Contingencies
    const [contingencies] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_contingencies\``);
    const contMap: any = {};
    for (const row of contingencies) {
        if (!contMap[row.student_id]) contMap[row.student_id] = [];
        contMap[row.student_id].push({
            id: row.contingency_id,
            institutionName: row.institution_name,
            type: row.contingency_type,
            status: row.contingency_status
        });
    }

    // 3. Fetch Core and Populate Firestore
    const [coreRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_core\``);
    let batch = db.batch();
    let count = 0;

    for (const row of coreRows) {
        const studentId = String(row.student_id);
        const payload = {
            id: studentId,
            name: row.full_name,
            program: row.program_code,
            institution: row.institution_code,
            status: row.enrollment_status,
            
            programStartDate: row.program_start_date?.value || null,
            reserveDate: row.reserve_date?.value || null,
            
            requirements: {
                officialTranscriptsReceived: row.trf_form_on_file,
                fundingPlan: row.funding_plan_status === 'Approved',
                orientationStarted: !!row.wwow_orientation_started_at,
            },
            
            courseActivity: courseMap[studentId] || [],
            contingencies: contMap[studentId] || [],
            
            lastUpdatedByPipelineAt: row.etl_updated_at?.value || null
        };

        const docRef = db.collection('student_records').doc(studentId);
        batch.set(docRef, payload, { merge: true });
        count++;

        if (count % 400 === 0) {
            await batch.commit();
            console.log(`[Node Ingester] Committed batch. Total: ${count}`);
            batch = db.batch();
        }
    }

    if (count % 400 !== 0) {
        await batch.commit();
    }
    
    console.log(`[Node Ingester] Finished! Successfully mapped ${count} records into Firestore.`);
}

syncBigQuery().catch(console.error);
