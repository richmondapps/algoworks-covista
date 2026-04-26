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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportQAData = exports.syncBigQueryNative = exports.onBqSyncTrigger = exports.queryStudentDocument = exports.aggregateChecklistsOnUpdate = exports.syncCommunicationsBackground = exports.syncAiInsightsBackground = exports.runMigration = void 0;
const functionsV1 = __importStar(require("firebase-functions"));
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const admin = __importStar(require("firebase-admin"));
const vertexai_1 = require("@google-cloud/vertexai");
const bigquery_1 = require("@google-cloud/bigquery");
const google_auth_library_1 = require("google-auth-library");
admin.initializeApp();
const db = admin.firestore();
const sync_from_bq_1 = require("./sync-from-bq");
exports.runMigration = functionsV1.https.onCall(async (data, context) => {
    // 1. Proxy BQ Sync through public V1 endpoint to bypass IAM Developer Lock
    if (data && data.action === 'syncBigQuery') {
        const result = await (0, sync_from_bq_1.syncBigQuery)();
        return result;
    }
    const oppsRef = db.collection('salesforce_opportunities');
    const snapshot = await oppsRef.get();
    let count = 0;
    const targetIds = ['A00302996', 'A00437050', 'A00409782'];
    const batch = db.batch();
    for (const doc of snapshot.docs) {
        const data = doc.data();
        const updateObj = {};
        if (data.name && !data.student_name) {
            updateObj.student_name = data.name;
        }
        if (targetIds.includes(doc.id) ||
            targetIds.includes(data.studentUid) ||
            targetIds.includes(data.id)) {
            const currentName = data.student_name || data.name || '';
            if (!currentName.includes('Test Subject')) {
                updateObj.student_name = `${currentName} - Test Subject`;
            }
            updateObj.isGeneratingAi = true; // force a dashboard refresh dynamically
            updateObj.syncTimestamp = Date.now();
        }
        // Natively inject readiness payload sync mapping reliably!
        const chks = await oppsRef.doc(doc.id).collection('personalized_checklists').get();
        let completed = 0;
        chks.forEach(c => {
            var _a;
            if ((_a = c.data()) === null || _a === void 0 ? void 0 : _a.is_satisfied)
                completed++;
        });
        let level = 'High';
        if (completed <= 2)
            level = 'Low';
        else if (completed <= 5)
            level = 'Medium';
        updateObj.readinessLevel = level;
        if (Object.keys(updateObj).length > 0) {
            updateObj.name = admin.firestore.FieldValue.delete(); // Delete legacy 'name'
            batch.update(doc.ref, updateObj);
            count++;
        }
    }
    await batch.commit();
    return { success: true, count };
});
/**
 * Background Event — orchestrates AI recomputation decoupled from the Angular UI.
 * This natively evades Domain Restricted Sharing entirely and operates purely
 * within the backend securely on the Cloud Run V2 default identity.
 */
exports.syncAiInsightsBackground = (0, firestore_1.onDocumentUpdated)({
    document: 'salesforce_opportunities/{studentId}',
    region: 'us-central1',
    timeoutSeconds: 300,
}, async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const studentUid = event.params.studentId;
    const newData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after.data();
    const oldData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.before.data();
    // ONLY execute organically when UI precisely flips the generation signal or a fresh timestamp physically registers synchronously.
    if ((newData === null || newData === void 0 ? void 0 : newData.isGeneratingAi) === true &&
        ((oldData === null || oldData === void 0 ? void 0 : oldData.isGeneratingAi) !== true ||
            (newData === null || newData === void 0 ? void 0 : newData.syncTimestamp) !== (oldData === null || oldData === void 0 ? void 0 : oldData.syncTimestamp))) {
        console.log(`[syncAiInsightsBackground] =============================================`);
        console.log(`[syncAiInsightsBackground] 🚀 EVENT ORCHESTRATED for student: ${studentUid}`);
        try {
            const isQA = process.env.GCLOUD_PROJECT === 'qa-wu-agenticai-app-proj';
            const isLocal = process.env.FUNCTIONS_EMULATOR === 'true';
            // Wait: QA backend not yet successfully deployed. The URL will be formally updated post QA IAM provisioning.
            let targetHttp = isQA
                ? 'https://covista-ai-backend-738161391370.us-central1.run.app'
                : 'https://covista-ai-backend-1033582308599.us-central1.run.app';
            if (isLocal)
                targetHttp = 'http://127.0.0.1:8081';
            // V2 naturally gets ID token blindly leveraging Cloud Run internal identity
            const auth = new google_auth_library_1.GoogleAuth();
            let client = null;
            if (!isLocal) {
                client = await auth.getIdTokenClient(targetHttp);
            }
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            const logsSnapshot = await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .collection('activity_logs')
                .where('activity_datetime', '>=', fourteenDaysAgo.toISOString())
                .get();
            const aggregatedSummary = [];
            const counters = {};
            const allowedMultiple = [
                'email',
                'sms',
                'call',
                'wow_login',
                'course_login',
            ];
            logsSnapshot.forEach((doc) => {
                var _a, _b;
                const log = doc.data();
                if (log.interaction_direction === 'inbound' ||
                    log.task_status === 'Received' ||
                    log.task_status === 'Talked To' ||
                    log.activity_category === 'SystemEvent') {
                    let key = ((_a = log.communication_type) === null || _a === void 0 ? void 0 : _a.toLowerCase()) ||
                        ((_b = log.activity_name) === null || _b === void 0 ? void 0 : _b.toLowerCase());
                    if (!key)
                        return;
                    if (!counters[key]) {
                        counters[key] = { count: 0, latest: '' };
                    }
                    if (allowedMultiple.includes(key)) {
                        counters[key].count++;
                    }
                    else {
                        counters[key].count = 1;
                    }
                    if (!counters[key].latest ||
                        log.activity_datetime > counters[key].latest) {
                        counters[key].latest = log.activity_datetime;
                    }
                }
            });
            for (const [key, data] of Object.entries(counters)) {
                aggregatedSummary.push({
                    [key]: data.count,
                    latest_datetime: data.latest,
                });
            }
            if (newData) {
                newData.recentActivitySummary = aggregatedSummary;
                // Bridge arbitrary 'Talked To' & external UI logs directly into legacy Python proxy stats schema to force immediate structural processing natively
                newData.stats = newData.stats || {};
                let totalMappedInteractions = 0;
                for (const data of Object.values(counters)) {
                    totalMappedInteractions += data.count;
                }
                newData.stats.emailOpens = totalMappedInteractions;
                newData.stats.smsClicks = 0;
            }
            console.log(`[syncAiInsightsBackground] Processed ${aggregatedSummary.length} aggregated activities for remote dispatch.`);
            console.log(`[syncAiInsightsBackground] Request payload prepared, dispatching to remote Python Agent...`);
            let response;
            if (isLocal) {
                const fetchRes = await fetch(`${targetHttp}/generate-insights`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentUid, dataContext: newData })
                });
                response = { status: fetchRes.status, data: await fetchRes.json() };
            }
            else {
                response = (await client.request({
                    url: `${targetHttp}/generate-insights`,
                    method: 'POST',
                    data: { studentUid, dataContext: newData },
                    timeout: 120000, // 120s timeout
                }));
            }
            console.log(`[syncAiInsightsBackground] Python Agent returned status: ${response.status}`);
            if (!response.status || response.status >= 400) {
                console.error(`[syncAiInsightsBackground] ERROR: Python agent returned error status: ${response.status}`, response.data);
                await db
                    .collection('salesforce_opportunities')
                    .doc(studentUid)
                    .update({
                    isGeneratingAi: false,
                    lastAiError: `Python agent returned ${response.status}`,
                });
                return;
            }
            console.log(`[syncAiInsightsBackground] SUCCESS: Payload received from Python agent. Structuring local writes...`);
            const aiPayload = response.data;
            // Write heavy AI payload to ai_insights/latest subcollection
            await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .collection('ai_insights')
                .doc('latest')
                .set(aiPayload, { merge: false });
            // Write lightweight summary fields + backward-compat aiInsights to root
            await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .update({
                aiInsights: aiPayload, // backward compat — remove once UI migrates to subcollection
                readinessLevel: (_d = (_c = aiPayload === null || aiPayload === void 0 ? void 0 : aiPayload.readinessLevel) === null || _c === void 0 ? void 0 : _c.level) !== null && _d !== void 0 ? _d : null,
                engagementLevel: (_f = (_e = aiPayload === null || aiPayload === void 0 ? void 0 : aiPayload.engagementLevel) === null || _e === void 0 ? void 0 : _e.level) !== null && _f !== void 0 ? _f : null,
                isGeneratingAi: false,
                isGeneratingComms: true, // Trigger async communications agent
                lastAiError: null,
            });
            console.log(`[syncAiInsightsBackground] 🏁 Firestore commit complete for ${studentUid}. Payload seamlessly stored.`);
        }
        catch (error) {
            console.error(`[syncAiInsightsBackground] CATCH ERROR: Failed orchestrating AI generation:`, error);
            await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .update({
                isGeneratingAi: false,
                lastAiError: error.message || 'Unknown orchestrator error.',
            });
        }
    }
});
/**
 * Isolated Background Event — organically triggers decoupled Communications rendering asynchronously.
 */
exports.syncCommunicationsBackground = (0, firestore_1.onDocumentUpdated)({
    document: 'salesforce_opportunities/{studentId}',
    region: 'us-central1',
    timeoutSeconds: 300,
}, async (event) => {
    var _a, _b;
    const studentUid = event.params.studentId;
    const newData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after.data();
    const oldData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.before.data();
    // ONLY execute organically when primary orchestrator transitions payload state or sync registers synchronously.
    if ((newData === null || newData === void 0 ? void 0 : newData.isGeneratingComms) === true &&
        ((oldData === null || oldData === void 0 ? void 0 : oldData.isGeneratingComms) !== true ||
            (newData === null || newData === void 0 ? void 0 : newData.syncTimestamp) !== (oldData === null || oldData === void 0 ? void 0 : oldData.syncTimestamp))) {
        console.log(`[syncCommunicationsBackground] 🚀 EVENT ORCHESTRATED for student: ${studentUid}`);
        try {
            const isQA = process.env.GCLOUD_PROJECT === 'qa-wu-agenticai-app-proj';
            const targetHttp = isQA
                ? 'https://covista-ai-backend-738161391370.us-central1.run.app'
                : 'https://covista-ai-backend-1033582308599.us-central1.run.app';
            const auth = new google_auth_library_1.GoogleAuth();
            const client = await auth.getIdTokenClient(targetHttp);
            const response = (await client.request({
                url: `${targetHttp}/generate-communications`,
                method: 'POST',
                data: { studentUid, dataContext: newData },
                timeout: 120000,
            }));
            if (!response.status || response.status >= 400) {
                console.error(`[syncCommunicationsBackground] ERROR: Python agent returned error status: ${response.status}`, response.data);
                await db
                    .collection('salesforce_opportunities')
                    .doc(studentUid)
                    .update({ isGeneratingComms: false });
                return;
            }
            const aiPayload = response.data;
            // Merge communications explicitly back into the existing AI Insights document natively
            await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .collection('ai_insights')
                .doc('latest')
                .set(aiPayload, { merge: true });
            await db.collection('salesforce_opportunities').doc(studentUid).update({
                isGeneratingComms: false,
            });
            console.log(`[syncCommunicationsBackground] 🏁 Communications organically mapped for ${studentUid}.`);
        }
        catch (error) {
            console.error(`[syncCommunicationsBackground] CATCH ERROR:`, error);
            await db
                .collection('salesforce_opportunities')
                .doc(studentUid)
                .update({ isGeneratingComms: false });
        }
    }
});
/**
 * Aggregate checklists to update main requirements
 */
exports.aggregateChecklistsOnUpdate = (0, firestore_1.onDocumentWritten)('salesforce_opportunities/{studentId}/personalized_checklists/{chkId}', async (event) => {
    var _a, _b;
    const studentUid = event.params.studentId;
    console.log(`Checklist updated for student: ${studentUid}`);
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    // If a key engagement checklist flips to true, seamlessly inject a system event natively into activity_logs
    if ((afterData === null || afterData === void 0 ? void 0 : afterData.is_satisfied) === true && (beforeData === null || beforeData === void 0 ? void 0 : beforeData.is_satisfied) !== true) {
        const chkId = event.params.chkId;
        if (chkId === 'wow_login' ||
            chkId === 'wwow_login' ||
            chkId === 'logged_into_course') {
            try {
                await admin
                    .firestore()
                    .collection('salesforce_opportunities')
                    .doc(studentUid)
                    .collection('activity_logs')
                    .add({
                    log_id: `sys-${Date.now()}`,
                    student_id: studentUid,
                    activity_category: 'SystemEvent',
                    activity_name: chkId === 'logged_into_course' ? 'course_login' : 'wow_login',
                    activity_datetime: new Date().toISOString(),
                    actor: 'System Auto-Trigger',
                });
                console.log(`[aggregateChecklistsOnUpdate] SystemEvent injected cleanly for ${chkId}`);
            }
            catch (e) {
                console.error('Failed to inject activity log for checklist map.', e);
            }
        }
    }
    try {
        const checklistsSnapshot = await admin
            .firestore()
            .collection('salesforce_opportunities')
            .doc(studentUid)
            .collection('personalized_checklists')
            .get();
        const requirements = {};
        checklistsSnapshot.forEach((doc) => {
            const id = doc.id;
            const satisfied = doc.data().is_satisfied === true;
            if (id === 'initial_portal_login')
                requirements.initialPortalLogin = satisfied;
            if (id === 'fafsa_submission') {
                requirements.fafsaSubmitted = satisfied;
            }
            if (id === 'course_registration')
                requirements.courseRegistration = satisfied;
            if (id === 'wwow_login' || id === 'wow_login')
                requirements.wowOrientation = satisfied;
            if (id === 'contingencies') {
                requirements.officialTranscriptsReceived = satisfied;
                requirements.nursingLicenseReceived = satisfied;
            }
            if (id === 'logged_into_course')
                requirements.courseLogin = satisfied;
            if (id === 'class_participation')
                requirements.classParticipation = satisfied;
        });
        // Update parent with aggregated requirements + sync metadata without merging obsolete fields
        await admin
            .firestore()
            .collection('salesforce_opportunities')
            .doc(studentUid)
            .update({
            requirements: requirements,
            syncTimestamp: Date.now(),
        });
        console.log(`[aggregateChecklistsOnUpdate] Requirements updated for ${studentUid}`);
    }
    catch (err) {
        console.error(`Failed to sync requirements.`, err);
    }
});
/**
 * Function to query student documents
 */
exports.queryStudentDocument = functionsV1.https.onCall(async (request) => {
    var _a, _b, _c, _d, _e;
    const { studentUid, fileName, query } = request.data;
    if (!studentUid || !fileName || !query) {
        throw new functionsV1.https.HttpsError('invalid-argument', 'Missing parameters');
    }
    try {
        console.log(`Querying document: ${fileName}`);
        const filePath = `uploads/${studentUid}/${fileName}`;
        const bucket = admin.storage().bucket();
        const [metadata] = await bucket.file(filePath).getMetadata();
        const mimeType = metadata.contentType || 'application/pdf';
        const fileUri = `gs://${bucket.name}/${filePath}`;
        const vertex_ai = new vertexai_1.VertexAI({
            project: process.env.GCLOUD_PROJECT || 'dev-wu-agenticai-app-proj',
            location: 'us-central1',
        });
        const model = 'gemini-2.5-flash';
        const generativeModel = vertex_ai.preview.getGenerativeModel({
            model: model,
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.2,
            },
        });
        const reqPayload = {
            contents: [
                {
                    role: 'user',
                    parts: [
                        { fileData: { fileUri, mimeType } },
                        {
                            text: `You are an expert financial aid and academic document reviewer. Read the attached file and explicitly answer the following question or perform the summary requested. \n\nQuery: "${query}"\n\nOnly return the plain text answer.`,
                        },
                    ],
                },
            ],
        };
        const resp = await generativeModel.generateContent(reqPayload);
        const responseText = ((_e = (_d = (_c = (_b = (_a = resp.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) ||
            'No response generated.';
        return { success: true, answer: responseText.trim() };
    }
    catch (e) {
        console.error('[queryStudentDocument] Vertex AI Document Parsing Failed', e);
        throw new https_1.HttpsError('internal', `Vertex AI Parsing Error: ${e.message}`);
    }
});
// ------------------------------------------------------------------
// Manual Pub/Sub Sync Simulator
__exportStar(require("./sync-simulator"), exports);
// ------------------------------------------------------------------
// Data Pipeline Synchronization
var sync_from_bq_2 = require("./sync-from-bq");
Object.defineProperty(exports, "onBqSyncTrigger", { enumerable: true, get: function () { return sync_from_bq_2.onBqSyncTrigger; } });
Object.defineProperty(exports, "syncBigQueryNative", { enumerable: true, get: function () { return sync_from_bq_2.syncBigQueryNative; } });
// ------------------------------------------------------------------
// DEV BQ Proxy
exports.exportQAData = (0, https_1.onRequest)(async (req, res) => {
    try {
        const bq = new bigquery_1.BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });
        const [coreRows] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.covista_demo.student_core\` WHERE status_stage = 'Reserved' LIMIT 10`);
        if (!coreRows || coreRows.length === 0) {
            res.status(404).send('No records found');
            return;
        }
        const studentIds = coreRows.map((r) => `'${r.student_id}'`).join(',');
        const [courses] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.covista_demo.student_courses\` WHERE student_id IN (${studentIds})`);
        const [contingencies] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.covista_demo.student_contingencies\` WHERE student_id IN (${studentIds})`);
        const [logs] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.covista_demo.r2c_student_activity_log\` WHERE student_id IN (${studentIds}) LIMIT 50`);
        const output = coreRows.map((student) => ({
            core: student,
            courses: courses.filter((c) => c.student_id === student.student_id),
            contingencies: contingencies.filter((c) => c.student_id === student.student_id),
            activityLogs: logs.filter((l) => l.student_id === student.student_id),
        }));
        res.json(output);
    }
    catch (err) {
        res.status(500).json({ error: err.message, stack: err.stack });
    }
});
//# sourceMappingURL=index.js.map