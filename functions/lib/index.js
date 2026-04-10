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
exports.queryStudentDocument = exports.aggregateChecklistsOnUpdate = exports.syncAiInsightsOnUpdate = exports.generateStudentCommunications = exports.generateStudentInsights = void 0;
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
 * Cloud Function to generate Next Best Action insights via Vertex AI gemini-3.1-pro-preview
 */
exports.generateStudentInsights = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { studentUid, dataContext } = request.data;
    if (!studentUid) {
        throw new https_1.HttpsError('invalid-argument', 'Missing student UID');
    }
    try {
        console.log(`Generating insights for student: ${studentUid}`);
        const execStart = Date.now();
        const agentResponse = await fetch('https://python-data-agent-1033582308599.us-central1.run.app/generate-insights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentUid, dataContext })
        });
        if (!agentResponse.ok) {
            throw new Error(`Python Proxy Failed: ${agentResponse.statusText}`);
        }
        const aiPayload = await agentResponse.json();
        const execDuration = Date.now() - execStart;
        console.log(`Insights generated successfully in ${execDuration}ms`);
        // Append generated AI payload directly to the student record in Firestore
        await db.collection('salesforce_opportunities').doc(studentUid).set({ aiInsights: aiPayload }, { merge: true });
        return { success: true, aiInsights: aiPayload };
    }
    catch (e) {
        console.error('[generateStudentInsights] Python Pipeline Execution Failed', e);
        throw new https_1.HttpsError('internal', `Python Architecture Failed: ${e.message}`);
    }
});
/**
 * Cloud Function to explicitly command the disconnected Communications Agent explicitly via Vertex AI gemini-3.1-pro-preview
 */
exports.generateStudentCommunications = (0, https_1.onCall)({ cors: true }, async (request) => {
    const { studentUid, dataContext } = request.data;
    if (!studentUid) {
        throw new https_1.HttpsError('invalid-argument', 'Missing student UID');
    }
    try {
        console.log(`Generating isolated communications for student: ${studentUid}`);
        const execStart = Date.now();
        const agentResponse = await fetch('https://python-data-agent-1033582308599.us-central1.run.app/generate-comms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentUid, dataContext })
        });
        if (!agentResponse.ok) {
            throw new Error(`Python Proxy Failed: ${agentResponse.statusText}`);
        }
        const aiPayload = await agentResponse.json();
        const execDuration = Date.now() - execStart;
        console.log(`Communications generated successfully in ${execDuration}ms. Python natively managed DB writes.`);
        return { success: true, aiInsights: aiPayload.comms };
    }
    catch (e) {
        console.error('[generateStudentCommunications] Python Pipeline Execution Failed', e);
        throw new https_1.HttpsError('internal', `Python Architecture Failed: ${e.message}`);
    }
});
/**
 * Background trigger to generate insights on save
 */
exports.syncAiInsightsOnUpdate = (0, firestore_1.onDocumentUpdated)('salesforce_opportunities/{studentId}', async (event) => {
    var _a, _b, _c, _d;
    const studentUid = event.params.studentId;
    console.log(`Update triggered for studentId: ${studentUid}`);
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!beforeData || !afterData) {
        console.log(`No data found`);
        return;
    }
    // check if ai insights triggered this update to avoid loops
    if (((_c = beforeData.aiInsights) === null || _c === void 0 ? void 0 : _c.generatedAt) !== ((_d = afterData.aiInsights) === null || _d === void 0 ? void 0 : _d.generatedAt) ||
        JSON.stringify(beforeData.aiInsights) !== JSON.stringify(afterData.aiInsights)) {
        console.log(`Skipping update loop`);
        return;
    }
    console.log(`Triggering insight generation for: ${studentUid}`);
    try {
        const targetHttp = 'https://python-data-agent-1033582308599.us-central1.run.app';
        const auth = new google_auth_library_1.GoogleAuth();
        const client = await auth.getIdTokenClient(targetHttp);
        const response = await client.request({
            url: `${targetHttp}/generate-insights`,
            method: 'POST',
            data: { studentUid, dataContext: afterData }
        });
        if (!response.status || response.status >= 400) {
            console.error(`Execution failure: ${response.status}`);
        }
        else {
            const aiPayload = response.data;
            await db.collection('salesforce_opportunities').doc(studentUid).set({ aiInsights: aiPayload, isGeneratingAi: false }, { merge: true });
            console.log(`Insights updated`);
        }
    }
    catch (err) {
        console.error(`Fetch exception:`, err);
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
        // Update parent, naturally invoking syncAiInsightsOnUpdate
        await admin.firestore().collection('salesforce_opportunities').doc(studentUid).set({
            requirements
        }, { merge: true });
        console.log(`Requirements updated`);
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
//# sourceMappingURL=index.js.map