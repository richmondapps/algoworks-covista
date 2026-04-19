import { BigQuery } from '@google-cloud/bigquery';
import * as admin from 'firebase-admin';


// Initialize SDKs natively on Application Default Credentials
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const bq = new BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });

const DATASET = 'covista_demo';
const COLLECTION = 'salesforce_opportunities'; // canonical collection per data contract

async function syncBigQuery() {
    console.log('[Node Ingester] Fetching BigQuery Tables with Start Date Constraints...');

    // 1. Fetch Core exactly bounded to future enrollment and limit to 10
    const [coreRows] = await bq.query(`
        SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_core\`
        WHERE program_start_date > CURRENT_DATE() 
          AND program_start_date <= DATE_ADD(CURRENT_DATE(), INTERVAL 3 MONTH)
        LIMIT 10
    `);

    if (!coreRows || coreRows.length === 0) {
        console.warn('[Node Ingester] No students found matching date constraints!');
        return;
    }

    // Isolate IDs for auxiliary IN queries
    const studentIds = coreRows.map((r: any) => `'${r.student_id}'`).join(',');
    console.log(`[Node Ingester] Isolated ${coreRows.length} target student models.`);

    // 2. Fetch Profile Logs exactly for the isolated users
    let profileMap: Record<string, any[]> = {};
    try {
        const [profileRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_profile_log\` WHERE student_id IN (${studentIds})`);
        for (const row of profileRows) {
            const sid = String(row.student_id);
            if (!profileMap[sid]) profileMap[sid] = [];
            profileMap[sid].push({
                audit_id: row.audit_id || null,
                term_code: row.term_code || null,
                change_ts: row.change_ts?.value || null,
                event_type: row.event_type || null,
                column_name: row.column_name || null,
                old_value: row.old_value || null,
                new_value: row.new_value || null
            });
        }
    } catch (e) {
        console.warn('[Node Ingester] student_profile_log mapping failure:', e);
    }

    // 3. Fetch Activity Logs using the exact 10 identifiers
    let activityMap: Record<string, any[]> = {};
    try {
        const [activityRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.r2c_student_activity_log\` WHERE student_id IN (${studentIds})`);
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
                task_status: row.task_status || null,
                case_number: row.case_number || null,
                case_subject: row.case_subject || null,
                case_record_type: row.case_record_type || null,
                case_type: row.case_type || null,
                case_status: row.case_status || null,
                actor: row.actor || null,
                source_system: row.source_system || null,
                last_updated_timestamp: row.last_updated_timestamp?.value || null
            });
        }
    } catch (e) {
        console.warn('[Node Ingester] r2c_student_activity_log not available:', e);
    }

    // 4. Batch Root Documents
    let batch = db.batch();
    let count = 0;

    for (const row of coreRows) {
        const studentId = String(row.student_id);
        const payload = {
            id: studentId,
            name: row.student_name,               // Changed from full_name to schema student_name
            program: row.program,                 // mapped from schema 'program'
            programName: row.program_name,        // mapped from schema 'program_name'
            institution: row.institution,         // mapped from schema 'institution'
            status: row.status_stage,             // mapped from schema 'status_stage'
            enrollmentSpecialist: row.enrollment_specialist_name,

            programStartDate: row.program_start_date?.value || null,
            reserveDate: row.reserve_date?.value || null,
            censusDate: row.census_date?.value || null,
            fundingType: row.funding_type || null,

            timeToProgramStartDays: row.time_to_program_start_days || null,
            timeSinceReserveDays: row.time_since_reserve_days || null,

            syncTimestamp: Date.now(),
            lastUpdatedAt: row.last_updated_at?.value || null
        };

        const docRef = db.collection(COLLECTION).doc(studentId);
        batch.set(docRef, payload, { merge: true });
        count++;
    }

    await batch.commit();
    console.log(`[Node Ingester] Root docs synced: ${count}`);

    // 5. Write personalized_checklists subcollection
    console.log('[Node Ingester] Writing personalized_checklists subcollections...');
    for (const row of coreRows) {
        const studentId = String(row.student_id);
        const checklistItems = buildChecklistItems(studentId, row);
        let clBatch = db.batch();
        for (const item of checklistItems) {
            const ref = db.collection(COLLECTION).doc(studentId).collection('personalized_checklists').doc(item.requirement_id);
            clBatch.set(ref, item, { merge: true });
        }
        await clBatch.commit();
    }

    // 6. Write activity_logs subcollection
    console.log('[Node Ingester] Writing activity_logs subcollections...');
    for (const [studentId, logs] of Object.entries(activityMap)) {
        let logBatch = db.batch();
        let logCount = 0;
        for (const log of logs) {
            const ref = db.collection(COLLECTION).doc(studentId).collection('activity_logs').doc(String(log.log_id));
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

    // 7. Write profile_logs subcollection
    console.log('[Node Ingester] Writing profile_logs subcollections...');
    for (const [studentId, profiles] of Object.entries(profileMap)) {
        let profBatch = db.batch();
        let profCount = 0;
        for (const p of profiles) {
            const fallbackId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
            const recordId = p.audit_id || fallbackId;
            const ref = db.collection(COLLECTION).doc(studentId).collection('profile_logs').doc(String(recordId));
            profBatch.set(ref, p, { merge: true });
            profCount++;
            if (profCount % 400 === 0) {
                await profBatch.commit();
                profBatch = db.batch();
            }
        }
        if (profCount % 400 !== 0) {
            await profBatch.commit();
        }
    }

    console.log(`[Node Ingester] Finished! Successfully mapped ${count} complete real-DB structures into Firestore.`);
}

/**
 * Derives personalized checklist items from a student_core BQ row.
 * These drive aggregateChecklistsOnUpdate and the dashboard requirements summary.
 */
function buildChecklistItems(studentId: string, row: any): any[] {
    return [
        {
            requirement_id: 'initial_portal_login',
            student_id: studentId,
            requirement_name: 'Initial Portal Login',
            category: 'Orientation',
            is_satisfied: !!row.wwow_orientation_started_at,
            source: 'student_core.wwow_orientation_started_at',
        },
        {
            requirement_id: 'wwow_login',
            student_id: studentId,
            requirement_name: 'WWOW Orientation Login',
            category: 'Orientation',
            is_satisfied: !!row.wwow_orientation_started_at,
            source: 'student_core.wwow_orientation_started_at',
        },
        {
            requirement_id: 'fafsa_submission',
            student_id: studentId,
            requirement_name: 'FAFSA Submission',
            category: 'Funding',
            is_satisfied: row.funding_plan_status === 'Approved' || row.funding_plan_status === 'Submitted',
            source: 'student_core.funding_plan_status',
        },
        {
            requirement_id: 'contingencies',
            student_id: studentId,
            requirement_name: 'Official Transcripts / Contingency Documents',
            category: 'Contingency',
            is_satisfied: !!row.trf_form_on_file,
            source: 'student_core.trf_form_on_file',
        },
    ];
}
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

export const onBqSyncTrigger = onDocumentWritten(
    { document: 'system_config/bq_sync_trigger', timeoutSeconds: 300 },
    async (event) => {
        // Only run if the document actually received a new write
        if (!event.data?.after.exists) return;
        
        console.log('[Node Ingester] Native Trigger received! Bypassing IAM CORS loop...');
        try {
            await syncBigQuery();
            console.log('[Node Ingester] Background execution complete.');
        } catch (e: any) {
            console.error('[Node Ingester] Execution Failure:', e);
        }
    }
);
