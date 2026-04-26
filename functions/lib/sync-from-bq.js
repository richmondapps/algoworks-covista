"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.onBqSyncTrigger = exports.syncBigQueryNative = void 0;
exports.syncBigQuery = syncBigQuery;
const bigquery_1 = require("@google-cloud/bigquery");
const admin = __importStar(require("firebase-admin"));
// Initialize SDKs natively on Application Default Credentials
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const bq = new bigquery_1.BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });
const DATASET = 'covista_demo';
const COLLECTION = 'salesforce_opportunities'; // canonical collection per data contract
async function syncBigQuery() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    let executionLog = [];
    const logOut = (msg) => {
        console.log(msg);
        executionLog.push(msg);
    };
    logOut('[Node Ingester] Fetching BigQuery Tables with Start Date Constraints...');
    // 1. Fetch Core bounded explicitly to the 3 target edge cases + 22 valid future enrollments
    const [coreRows] = await bq.query(`
        SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_core\`
        WHERE student_id IN ('A00302996', 'A00437050', 'A00409782')
        UNION ALL
        SELECT * FROM (
            SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_core\`
            WHERE status_stage = 'Reserved'
              AND program_start_date > CURRENT_DATE() 
              AND student_id NOT IN ('A00302996', 'A00437050', 'A00409782')
            LIMIT 22
        )
    `);
    if (!coreRows || coreRows.length === 0) {
        logOut('[Node Ingester] No students found matching date constraints!');
        return { success: false, log: executionLog };
    }
    // Isolate IDs for auxiliary IN queries
    const studentIds = coreRows.map((r) => `'${r.student_id}'`).join(',');
    logOut(`[Node Ingester] Isolated ${coreRows.length} target student models.`);
    // 2. Fetch Profile Logs exactly for the isolated users
    let profileMap = {};
    try {
        const [profileRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_profile_log\` WHERE student_id IN (${studentIds})`);
        for (const row of profileRows) {
            const sid = String(row.student_id);
            if (!profileMap[sid])
                profileMap[sid] = [];
            profileMap[sid].push({
                audit_id: row.audit_id || null,
                term_code: row.term_code || null,
                change_ts: ((_a = row.change_ts) === null || _a === void 0 ? void 0 : _a.value) || null,
                event_type: row.event_type || null,
                column_name: row.column_name || null,
                old_value: row.old_value || null,
                new_value: row.new_value || null
            });
        }
    }
    catch (e) {
        logOut(`[Node Ingester] student_profile_log mapping failure: ${e.message}`);
    }
    // 3. Fetch Activity Logs and Contingencies
    let activityMap = {};
    let contingencyMap = {};
    try {
        const [activityRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.r2c_student_activity_log\` WHERE student_id IN (${studentIds})`);
        for (const row of activityRows) {
            const sid = String(row.student_id);
            if (!activityMap[sid])
                activityMap[sid] = [];
            activityMap[sid].push({
                log_id: row.log_id || `${sid}_${((_b = row.activity_datetime) === null || _b === void 0 ? void 0 : _b.value) || Date.now()}`,
                student_id: sid,
                term_code: row.term_code || null,
                activity_category: row.activity_category || 'Engagement',
                activity_name: row.activity_name || 'unknown',
                activity_datetime: ((_c = row.activity_datetime) === null || _c === void 0 ? void 0 : _c.value) || null,
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
                last_updated_timestamp: ((_d = row.last_updated_timestamp) === null || _d === void 0 ? void 0 : _d.value) || null
            });
            // Extract contingencies since they were flattened into activity_log by the client data contract
            // Extract contingencies since they were flattened into activity_log by the client data contract
            if (!contingencyMap[sid])
                contingencyMap[sid] = [];
            // Dynamically scan the row for any Capella reference to brutally enforce mapping regardless of BQ schema drops
            const rowStr = JSON.stringify(row).toUpperCase();
            if (rowStr.includes('CAPELLA')) {
                if (!contingencyMap[sid].includes('Capella University')) {
                    contingencyMap[sid].push('Capella University');
                }
            }
            else {
                const rawInstName = row.contingency_institution_name || row.institution_name;
                if (rawInstName && typeof rawInstName === 'string' && rawInstName.trim().length > 0) {
                    let instName = rawInstName.trim();
                    const normalizeName = (name) => name.toLowerCase().replace(/\s+/g, '');
                    const normalizedTarget = normalizeName(instName);
                    if (normalizedTarget !== 'unofficialtranscript' && normalizedTarget !== 'phd') {
                        if (instName && !contingencyMap[sid].some(existing => normalizeName(existing) === normalizedTarget)) {
                            contingencyMap[sid].push(instName);
                        }
                    }
                }
            }
        }
    }
    catch (e) {
        logOut(`[Node Ingester] r2c_student_activity_log not available: ${e.message}`);
    }
    // 3.8 Sweep Invalid Firestore Documents
    const existing = await db.collection(COLLECTION).get();
    let deleteBatch = db.batch();
    const targetedIds = coreRows.map((r) => String(r.student_id));
    let sweepCount = 0;
    for (const doc of existing.docs) {
        if (!targetedIds.includes(doc.id)) {
            deleteBatch.delete(doc.ref);
            sweepCount++;
        }
    }
    if (sweepCount > 0) {
        await deleteBatch.commit();
        logOut(`[Node Ingester] Swept ${sweepCount} stale records from Firestore.`);
    }
    // 3.9 Aggregate student_core rows into a unique map to preserve truthy booleans across multi-term overwrites
    let aggregatedCoreMap = {};
    for (const row of coreRows) {
        const sid = String(row.student_id);
        if (!aggregatedCoreMap[sid]) {
            aggregatedCoreMap[sid] = Object.assign({}, row);
        }
        else {
            // Merge truthy checklist values forward natively
            if (row.registered_credits && row.registered_credits > 0)
                aggregatedCoreMap[sid].registered_credits = row.registered_credits;
            if (row.wwow_orientation_started_at)
                aggregatedCoreMap[sid].wwow_orientation_started_at = row.wwow_orientation_started_at;
            if (row.first_assignment_submitted_at)
                aggregatedCoreMap[sid].first_assignment_submitted_at = row.first_assignment_submitted_at;
            if (row.participated_by_census)
                aggregatedCoreMap[sid].participated_by_census = row.participated_by_census;
            if (row.trf_form_on_file)
                aggregatedCoreMap[sid].trf_form_on_file = row.trf_form_on_file;
            if (row.funding_plan_status === 'Approved' || row.funding_plan_status === 'Submitted')
                aggregatedCoreMap[sid].funding_plan_status = row.funding_plan_status;
        }
    }
    const uniqueCoreRows = Object.values(aggregatedCoreMap);
    // 4. Batch Root Documents
    let batch = db.batch();
    let count = 0;
    for (const row of uniqueCoreRows) {
        const studentId = String(row.student_id);
        const rd = ((_e = row.reserve_date) === null || _e === void 0 ? void 0 : _e.value) ? new Date((_f = row.reserve_date) === null || _f === void 0 ? void 0 : _f.value) : new Date();
        const randomHours = Math.random() * 3 + 1; // 1.0 to 4.0 hours
        const portalLoginDate = new Date(rd.getTime() + randomHours * 60 * 60 * 1000);
        if (!activityMap[studentId])
            activityMap[studentId] = [];
        activityMap[studentId].push({
            log_id: `sys_synthetic_portal_login_${studentId}`,
            student_id: studentId,
            activity_category: 'Student Event',
            activity_name: 'portal_login',
            activity_datetime: portalLoginDate.toISOString(),
            task_status: 'Completed',
            actor: 'System Auto-Trigger'
        });
        const hardcodedSubjects = ['A00302996', 'A00437050', 'A00409782'];
        let syncName = row.student_name;
        if (hardcodedSubjects.includes(studentId)) {
            syncName = `${syncName} - Test Subject`;
        }
        // Dynamically compute organic readiness level natively identically to the UI payload mapping
        const chkListItems = buildChecklistItems(studentId, row, contingencyMap, activityMap);
        const resolvedCount = chkListItems.filter((i) => i.is_satisfied).length;
        let cReadiness = 'High';
        if (resolvedCount <= 2)
            cReadiness = 'Low';
        else if (resolvedCount <= 5)
            cReadiness = 'Medium';
        // Dynamically compute engagement level based on the strict temporal matrices
        let cEngagement = 'Low';
        const rawLogs = activityMap[studentId] || [];
        let latestEngagementDt = null;
        for (const log of rawLogs) {
            const cat = String(log.activity_category || '').toLowerCase();
            const name = String(log.activity_name || '').toLowerCase();
            const dir = String(log.interaction_direction || '').toLowerCase();
            const status = String(log.task_status || '').toLowerCase();
            if (cat === 'systemevent')
                continue;
            let isEngagement = false;
            if (dir === 'inbound' || status === 'received' || status === 'talked to')
                isEngagement = true;
            else if (cat === 'engagement' || cat === 'student_event')
                isEngagement = true;
            else if (name.includes('sms') || name.includes('email') || name.includes('call'))
                isEngagement = true;
            if (isEngagement && log.activity_datetime) {
                try {
                    const dt = new Date(log.activity_datetime.replace('Z', '+00:00'));
                    if (!latestEngagementDt || dt > latestEngagementDt)
                        latestEngagementDt = dt;
                }
                catch (e) { }
            }
        }
        const msInDay = 1000 * 60 * 60 * 24;
        let daysSinceEngagement = Infinity;
        if (latestEngagementDt) {
            daysSinceEngagement = Math.max(0, (Date.now() - latestEngagementDt.getTime()) / msInDay);
        }
        const daysToStart = row.time_to_program_start_days !== undefined && row.time_to_program_start_days !== null
            ? row.time_to_program_start_days
            : 30; // fallback to >= 4 weeks tier
        if (daysToStart < 28) {
            if (daysSinceEngagement <= 3)
                cEngagement = 'High';
            else if (daysSinceEngagement <= 7)
                cEngagement = 'Medium';
            else
                cEngagement = 'Low';
        }
        else {
            if (daysSinceEngagement <= 5)
                cEngagement = 'High';
            else if (daysSinceEngagement <= 10)
                cEngagement = 'Medium';
            else
                cEngagement = 'Low';
        }
        const payload = {
            id: studentId,
            name: syncName, // Conditionally mapped dynamic test subject append
            isGeneratingAi: hardcodedSubjects.includes(studentId) ? true : admin.firestore.FieldValue.delete(), // trigger dashboard
            program: row.program, // mapped from schema 'program'
            programName: row.program_name, // mapped from schema 'program_name'
            institution: row.institution, // mapped from schema 'institution'
            status: row.status_stage, // mapped from schema 'status_stage'
            enrollmentSpecialist: row.enrollment_specialist_name,
            programStartDate: ((_g = row.program_start_date) === null || _g === void 0 ? void 0 : _g.value) || null,
            reserveDate: ((_h = row.reserve_date) === null || _h === void 0 ? void 0 : _h.value) || null,
            censusDate: ((_j = row.census_date) === null || _j === void 0 ? void 0 : _j.value) || null,
            fundingType: row.funding_type || null,
            timeToProgramStartDays: row.time_to_program_start_days || null,
            timeSinceReserveDays: row.time_since_reserve_days || null,
            readinessLevel: cReadiness, // Natively injected root computation securely
            engagementLevel: cEngagement, // Natively injected root computation cleanly
            syncTimestamp: Date.now(),
            lastUpdatedAt: ((_k = row.last_updated_at) === null || _k === void 0 ? void 0 : _k.value) || null
        };
        const docRef = db.collection(COLLECTION).doc(studentId);
        batch.set(docRef, payload, { merge: true });
        count++;
    }
    await batch.commit();
    logOut(`[Node Ingester] Root docs synced: ${count}`);
    // 5. Write personalized_checklists subcollection
    logOut('[Node Ingester] Writing personalized_checklists subcollections...');
    for (const row of uniqueCoreRows) {
        const studentId = String(row.student_id);
        const checklistItems = buildChecklistItems(studentId, row, contingencyMap, activityMap);
        let clBatch = db.batch();
        for (const item of checklistItems) {
            const ref = db.collection(COLLECTION).doc(studentId).collection('personalized_checklists').doc(item.requirement_id);
            clBatch.set(ref, item, { merge: true });
        }
        await clBatch.commit();
    }
    // 6. Write activity_logs subcollection
    logOut('[Node Ingester] Writing activity_logs subcollections...');
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
    logOut('[Node Ingester] Writing profile_logs subcollections...');
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
    logOut(`[Node Ingester] Finished! Successfully mapped ${count} complete real-DB structures into Firestore.`);
    return { success: true, log: executionLog };
}
/**
 * Derives personalized checklist items from a student_core BQ row and activity logs.
 * These drive aggregateChecklistsOnUpdate and the dashboard requirements summary.
 */
function buildChecklistItems(studentId, row, contingencyMap, activityMap) {
    const contingencyInstitutions = contingencyMap && contingencyMap[studentId] ? contingencyMap[studentId] : [];
    // Scan historical logs natively for explicit system events to bypass stale schema data
    const logs = activityMap[studentId] || [];
    const hasActivity = (names) => logs.some(l => { var _a; return names.includes((_a = l.activity_name) === null || _a === void 0 ? void 0 : _a.toLowerCase()) && !!l.activity_datetime; });
    const wowSatisfied = !!row.wwow_orientation_started_at || hasActivity(['wwow_login', 'wow_login']);
    const registrationSatisfied = (!!row.registered_credits && row.registered_credits > 0) || hasActivity(['course_registration', 'first_course_registration']);
    const participatedSatisfied = !!row.participated_by_census || hasActivity(['logged_into_course', 'class_participation']);
    return [
        {
            requirement_id: 'initial_portal_login',
            student_id: studentId,
            requirement_name: 'Initial Portal Login',
            category: 'Orientation',
            is_satisfied: true,
            source: 'synthetic_temporal_rules',
        },
        {
            requirement_id: 'wwow_login',
            student_id: studentId,
            requirement_name: 'WWOW Orientation Login',
            category: 'Orientation',
            is_satisfied: wowSatisfied,
            source: 'student_core & student_event',
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
            contingency_institution_name: contingencyInstitutions.length > 0 ? contingencyInstitutions.map((n) => ({ name: n })) : admin.firestore.FieldValue.delete(),
        },
        {
            requirement_id: 'course_registration',
            student_id: studentId,
            requirement_name: 'Course Registration',
            category: 'Registration',
            is_satisfied: registrationSatisfied,
            source: 'student_core & student_event',
        },
        {
            requirement_id: 'firstAssignmentSubmitted',
            student_id: studentId,
            requirement_name: 'First Assignment Submitted',
            category: 'Participation',
            is_satisfied: !!row.first_assignment_submitted_at,
            source: 'student_core.first_assignment_submitted_at',
        },
        {
            requirement_id: 'assignmentByCensusDay',
            student_id: studentId,
            requirement_name: 'Participated By Census Day',
            category: 'Participation',
            is_satisfied: participatedSatisfied,
            source: 'student_core & student_event',
        },
    ];
}
const firestore_1 = require("firebase-functions/v2/firestore");
const functionsV1 = __importStar(require("firebase-functions"));
exports.syncBigQueryNative = functionsV1.https.onCall(async (data, context) => {
    console.log('[Node Ingester] Fired manually from dashboard.');
    try {
        const result = await syncBigQuery();
        return result;
    }
    catch (e) {
        console.error('[Node Ingester] Execution Failure:', e);
        throw new functionsV1.https.HttpsError('internal', e.message);
    }
});
exports.onBqSyncTrigger = (0, firestore_1.onDocumentWritten)({ document: 'system_config/bq_sync_trigger', timeoutSeconds: 300 }, async (event) => {
    var _a;
    // Only run if the document actually received a new write
    if (!((_a = event.data) === null || _a === void 0 ? void 0 : _a.after.exists))
        return;
    console.log('[Node Ingester] Native Trigger received! Bypassing IAM CORS loop...');
    try {
        await syncBigQuery();
        console.log('[Node Ingester] Background execution complete.');
    }
    catch (e) {
        console.error('[Node Ingester] Execution Failure:', e);
    }
});
//# sourceMappingURL=sync-from-bq.js.map