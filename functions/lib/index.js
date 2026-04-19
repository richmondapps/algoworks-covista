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
exports.onBqSyncTrigger = exports.queryStudentDocument = exports.aggregateChecklistsOnUpdate = exports.syncAiInsightsOnUpdate = void 0;
const google_auth_library_1 = require("google-auth-library");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
// import { onRequest } from 'firebase-functions/v2/https';
const admin = __importStar(require("firebase-admin"));
const vertexai_1 = require("@google-cloud/vertexai");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
/**
 * Fields written by the Python agent or used as UI/bookkeeping flags.
 * Changes to these fields do NOT represent upstream ingestion changes and must
 * never re-trigger AI orchestration (recursion guard).
 */
const DERIVED_FIELDS = [
    // Written by Python agent
    'agentTrace',
    'emailDraft',
    'smsDraft',
    'engagementRisk',
    'readinessRisk',
    'metrics',
    'nextBestActions',
    'generatedAt',
    'aiInsights', // legacy AI container
    // UI / bookkeeping flags
    'isGeneratingAi',
    'syncTimestamp',
    'lastAiError',
];
function stripDerived(doc) {
    if (!doc)
        return {};
    const clean = Object.assign({}, doc);
    for (const f of DERIVED_FIELDS)
        delete clean[f];
    return clean;
}
/**
 * Background trigger — orchestrates AI recomputation when upstream student
 * data changes in Firestore (via BQ sync, Airflow, Pub/Sub, or manual
 * "Regenerate" button in the Angular UI which writes { isGeneratingAi: true }).
 *
 * Recursion guard: derived-only writes (AI write-back, UI flags) are detected
 * via DERIVED_FIELDS blacklist and silently skipped to prevent infinite loops.
 * Additionally, an explicit forceRegenerate path fires when isGeneratingAi
 * flips from false/undefined → true.
 *
 * On success: writes heavy AI payload to ai_insights/latest subcollection,
 * copies lightweight readinessLevel + engagementLevel to root doc for
 * dashboard filtering, and keeps aiInsights on root for backward compat.
 */
exports.syncAiInsightsOnUpdate = (0, firestore_1.onDocumentUpdated)({ document: 'salesforce_opportunities/{studentId}', retry: false }, async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const studentUid = event.params.studentId;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!beforeData || !afterData) {
        console.log(`[syncAiInsightsOnUpdate] ERROR: Missing beforeData or afterData for ${studentUid}`);
        return;
    }
    console.log(`[syncAiInsightsOnUpdate] Trigger invoked for: ${studentUid}`);
    console.log(`[syncAiInsightsOnUpdate] isGeneratingAi -> BEFORE: ${beforeData.isGeneratingAi} | AFTER: ${afterData.isGeneratingAi}`);
    console.log(`[syncAiInsightsOnUpdate] syncTimestamp -> BEFORE: ${beforeData.syncTimestamp} | AFTER: ${afterData.syncTimestamp}`);
    // --- Recursion guard ---
    const upstreamChanged = JSON.stringify(stripDerived(beforeData)) !==
        JSON.stringify(stripDerived(afterData));
    // Explicit force: UI writes { isGeneratingAi: true } to trigger regenerate
    const forceRegenerate = (beforeData.isGeneratingAi !== true && afterData.isGeneratingAi === true) ||
        (afterData.isGeneratingAi === true && afterData.syncTimestamp !== beforeData.syncTimestamp);
    console.log(`[syncAiInsightsOnUpdate] Guard Evals -> upstreamChanged: ${upstreamChanged}, forceRegenerate: ${forceRegenerate}`);
    if (!upstreamChanged && !forceRegenerate) {
        console.log(`[recursionGuard] SILENT SKIP: No upstream change and no force regenerate detected for ${studentUid}.`);
        return;
    }
    console.log(`[trigger] PROCEEDING for ${studentUid} — Calling Python Agent (targetHttp = https://python-data-agent-1033582308599.us-central1.run.app)`);
    try {
        // Re-fetch the latest full snapshot so the agent always works with
        // the most current state, regardless of write ordering.
        const latestDoc = await db.collection('salesforce_opportunities').doc(studentUid).get();
        const latestData = latestDoc.data();
        if (!latestData) {
            console.warn(`[trigger] Document disappeared before AI call: ${studentUid}`);
            return;
        }
        const targetHttp = 'https://python-data-agent-1033582308599.us-central1.run.app';
        const auth = new google_auth_library_1.GoogleAuth();
        const client = await auth.getIdTokenClient(targetHttp);
        console.log(`[trigger] Request payload prepared, dispatching to remote Agent...`);
        const response = await client.request({
            url: `${targetHttp}/generate-insights`,
            method: 'POST',
            data: { studentUid, dataContext: latestData },
        });
        console.log(`[trigger] Python Agent returned status: ${response.status}`);
        if (!response.status || response.status >= 400) {
            console.error(`[trigger] ERROR: Python agent returned error status: ${response.status}`, response.data);
            await db.collection('salesforce_opportunities').doc(studentUid).set({ isGeneratingAi: false, lastAiError: `Python agent returned ${response.status}` }, { merge: true });
        }
        else {
            console.log(`[trigger] SUCCESS: Payload received from Python agent. Structuring local writes...`);
            const aiPayload = response.data;
            // Write heavy AI output to ai_insights/latest subcollection
            await db.collection('salesforce_opportunities')
                .doc(studentUid)
                .collection('ai_insights')
                .doc('latest')
                .set(aiPayload, { merge: false });
            // Write lightweight summary fields + backward-compat aiInsights to root
            await db.collection('salesforce_opportunities').doc(studentUid).set({
                aiInsights: aiPayload, // backward compat — remove once UI migrates to subcollection
                readinessLevel: (_d = (_c = aiPayload === null || aiPayload === void 0 ? void 0 : aiPayload.readinessRisk) === null || _c === void 0 ? void 0 : _c.level) !== null && _d !== void 0 ? _d : null,
                engagementLevel: (_f = (_e = aiPayload === null || aiPayload === void 0 ? void 0 : aiPayload.engagementRisk) === null || _e === void 0 ? void 0 : _e.level) !== null && _f !== void 0 ? _f : null,
                isGeneratingAi: false,
                lastAiError: null,
            }, { merge: true });
            console.log(`[trigger] ai_insights/latest written and root updated for ${studentUid}`);
            // --- TAIL EXECUTION: Dispatch communications block asynchronously but await resolution ---
            console.log(`[trigger] Tail Execution: Dispatching /generate-comms for ${studentUid}`);
            try {
                const commsResponse = await client.request({
                    url: `${targetHttp}/generate-comms`,
                    method: 'POST',
                    data: { studentUid, dataContext: latestData },
                });
                if (commsResponse.status && commsResponse.status < 400) {
                    console.log(`[trigger] SUCCESS: Communication drafts received. Merging natively into ai_insights/latest...`);
                    await db.collection('salesforce_opportunities')
                        .doc(studentUid)
                        .collection('ai_insights')
                        .doc('latest')
                        .set(commsResponse.data, { merge: true });
                    // Also shallow merge onto root for legacy UI component consistency until fully deprecated
                    await db.collection('salesforce_opportunities').doc(studentUid).set({ aiInsights: commsResponse.data }, { merge: true });
                }
                else {
                    console.error(`[trigger] ERROR: /generate-comms failed with status ${commsResponse.status}`, commsResponse.data);
                }
            }
            catch (commsErr) {
                console.error(`[trigger] WARNING: Tail execution for /generate-comms explicitly failed:`, commsErr);
            }
        }
    }
    catch (err) {
        console.error(`[syncAiInsightsOnUpdate] Python agent failure for ${studentUid}:`, err);
        // Reset flag so the UI doesn't stay stuck on the loading spinner.
        // This write only touches DERIVED_FIELDS so the guard will skip it.
        try {
            await db.collection('salesforce_opportunities').doc(studentUid).set({
                isGeneratingAi: false,
                lastAiError: {
                    message: err instanceof Error ? err.message : String(err),
                    at: new Date().toISOString(),
                },
            }, { merge: true });
        }
        catch (cleanupErr) {
            console.error(`[syncAiInsightsOnUpdate] Failed to reset isGeneratingAi flag:`, cleanupErr);
        }
    }
});
const firestore_2 = require("firebase-functions/v2/firestore");
/**
 * Aggregate checklists to update main requirements
 */
exports.aggregateChecklistsOnUpdate = (0, firestore_2.onDocumentWritten)('salesforce_opportunities/{studentId}/personalized_checklists/{chkId}', async (event) => {
    const studentUid = event.params.studentId;
    console.log(`Checklist updated for student: ${studentUid}`);
    try {
        const checklistsSnapshot = await admin.firestore().collection('salesforce_opportunities').doc(studentUid).collection('personalized_checklists').get();
        const requirements = {};
        checklistsSnapshot.forEach(doc => {
            const id = doc.id;
            const satisfied = doc.data().is_satisfied === true;
            if (id === 'initial_portal_login')
                requirements.orientationStarted = satisfied;
            if (id === 'fafsa_submission') {
                requirements.fafsaSubmitted = satisfied;
                requirements.fundingPlan = satisfied;
            }
            if (id === 'course_registration')
                requirements.courseRegistration = satisfied;
            if (id === 'wwow_login')
                requirements.wwowOrientationStarted = satisfied;
            if (id === 'contingencies') {
                requirements.officialTranscriptsReceived = satisfied;
                requirements.nursingLicenseReceived = satisfied;
            }
            if (id === 'logged_into_course')
                requirements.firstAssignmentSubmitted = satisfied; // Mapped loosely for test schema
            if (id === 'class_participation')
                requirements.assignmentByCensusDay = satisfied;
        });
        // Update parent with aggregated requirements + sync metadata
        await admin.firestore().collection('salesforce_opportunities').doc(studentUid).set({
            requirements,
            syncTimestamp: Date.now()
        }, { merge: true });
        console.log(`[aggregateChecklistsOnUpdate] Requirements updated for ${studentUid}`);
    }
    catch (err) {
        console.error(`Failed to sync requirements.`, err);
    }
});
/**
 * Function to query student documents
 */
exports.queryStudentDocument = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    const { studentUid, fileName, query } = request.data;
    if (!studentUid || !fileName || !query) {
        throw new https_1.HttpsError('invalid-argument', 'Missing uid, fileName, or query');
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
var sync_from_bq_1 = require("./sync-from-bq");
Object.defineProperty(exports, "onBqSyncTrigger", { enumerable: true, get: function () { return sync_from_bq_1.onBqSyncTrigger; } });
//# sourceMappingURL=index.js.map