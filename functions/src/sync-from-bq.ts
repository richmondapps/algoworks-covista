import { BigQuery } from '@google-cloud/bigquery';
import * as admin from 'firebase-admin';

// Initialize SDKs natively on Application Default Credentials
admin.initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });
const db = admin.firestore();
const bq = new BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });

const DATASET = 'covista_demo';
const COLLECTION = 'salesforce_opportunities'; // canonical collection per data contract

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

    // 3. Fetch Activity Logs (r2c_student_activity_log) if available
    let activityMap: Record<string, any[]> = {};
    try {
        const [activityRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.r2c_student_activity_log\``);
        for (const row of activityRows) {
            const sid = String(row.student_id);
            if (!activityMap[sid]) activityMap[sid] = [];
            activityMap[sid].push({
                log_id: row.log_id || `${sid}_${row.activity_datetime?.value || Date.now()}`,
                student_id: sid,
                term_code: row.term_code || null,
                activity_category: row.activity_category || 'Engagement',
                activity_name: row.activity_name || 'unknown',
                activity_datetime: row.activity_datetime?.value || null,
                communication_type: row.communication_type || null,
                task_notes: row.task_notes || null,
                task_comments: row.task_comments || null,
                interaction_direction: row.interaction_direction || null,
                case_number: row.case_number || null,
                case_status: row.case_status || null,
            });
        }
    } catch (e) {
        console.warn('[Node Ingester] r2c_student_activity_log not available:', e);
    }

    // 4. Fetch Core and Populate Firestore root docs
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

            syncTimestamp: Date.now(),
            lastUpdatedByPipelineAt: row.etl_updated_at?.value || null
        };

        const docRef = db.collection(COLLECTION).doc(studentId);
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

    console.log(`[Node Ingester] Root docs synced: ${count}`);

    // 5. Write personalized_checklists subcollection per student
    console.log('[Node Ingester] Writing personalized_checklists subcollections...');
    for (const row of await (async () => {
        const [rows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_core\``);
        return rows;
    })()) {
        const studentId = String(row.student_id);
        const checklistItems = buildChecklistItems(studentId, row);
        let clBatch = db.batch();
        for (const item of checklistItems) {
            const ref = db.collection(COLLECTION).doc(studentId).collection('personalized_checklists').doc(item.checklist_id);
            clBatch.set(ref, item, { merge: true });
        }
        await clBatch.commit();
    }

    // 6. Write student_activity_logs subcollection per student (idempotent by log_id)
    console.log('[Node Ingester] Writing student_activity_logs subcollections...');
    for (const [studentId, logs] of Object.entries(activityMap)) {
        let logBatch = db.batch();
        let logCount = 0;
        for (const log of logs) {
            const ref = db.collection(COLLECTION).doc(studentId).collection('student_activity_logs').doc(String(log.log_id));
            logBatch.set(ref, log, { merge: true });
            logCount++;
            if (logCount % 400 === 0) {
                await logBatch.commit();
                logBatch = db.batch();
            }
        }
        if (logCount % 400 !== 0) {
            await logBatch.commit();
        }
    }

    console.log(`[Node Ingester] Finished! Successfully mapped ${count} records + subcollections into Firestore.`);
}

/**
 * Derives personalized checklist items from a student_core BQ row.
 * These drive aggregateChecklistsOnUpdate and the dashboard requirements summary.
 */
function buildChecklistItems(studentId: string, row: any): any[] {
    return [
        {
            checklist_id: 'initial_portal_login',
            student_id: studentId,
            item_name: 'Initial Portal Login',
            category: 'Orientation',
            is_satisfied: !!row.wwow_orientation_started_at,
            source: 'student_core.wwow_orientation_started_at',
        },
        {
            checklist_id: 'wwow_login',
            student_id: studentId,
            item_name: 'WWOW Orientation Login',
            category: 'Orientation',
            is_satisfied: !!row.wwow_orientation_started_at,
            source: 'student_core.wwow_orientation_started_at',
        },
        {
            checklist_id: 'fafsa_submission',
            student_id: studentId,
            item_name: 'FAFSA Submission',
            category: 'Funding',
            is_satisfied: row.funding_plan_status === 'Approved' || row.funding_plan_status === 'Submitted',
            source: 'student_core.funding_plan_status',
        },
        {
            checklist_id: 'contingencies',
            student_id: studentId,
            item_name: 'Official Transcripts / Contingency Documents',
            category: 'Contingency',
            is_satisfied: !!row.trf_form_on_file,
            source: 'student_core.trf_form_on_file',
        },
    ];
}

syncBigQuery().catch(console.error);


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
