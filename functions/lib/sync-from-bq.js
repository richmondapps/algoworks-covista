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
const bigquery_1 = require("@google-cloud/bigquery");
const admin = __importStar(require("firebase-admin"));
// Initialize SDKs natively on Application Default Credentials
admin.initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });
const db = admin.firestore();
const bq = new bigquery_1.BigQuery({ projectId: 'dev-wu-agenticai-app-proj' });
const DATASET = 'covista_demo';
async function syncBigQuery() {
    var _a, _b, _c, _d, _e;
    console.log('[Node Ingester] Fetching BigQuery Tables...');
    // 1. Fetch Courses
    const [courses] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_courses\``);
    const courseMap = {};
    for (const row of courses) {
        if (!courseMap[row.student_id])
            courseMap[row.student_id] = [];
        courseMap[row.student_id].push({
            courseId: row.course_id,
            isAccredited: row.is_accredited,
            registrationStatus: row.course_registration_status,
            firstLoginAt: ((_a = row.first_login_at) === null || _a === void 0 ? void 0 : _a.value) || null,
            firstDiscussionPostAt: ((_b = row.first_discussion_post_at) === null || _b === void 0 ? void 0 : _b.value) || null
        });
    }
    // 2. Fetch Contingencies
    const [contingencies] = await bq.query(`SELECT * FROM \`dev-wu-agenticai-app-proj.${DATASET}.student_contingencies\``);
    const contMap = {};
    for (const row of contingencies) {
        if (!contMap[row.student_id])
            contMap[row.student_id] = [];
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
            programStartDate: ((_c = row.program_start_date) === null || _c === void 0 ? void 0 : _c.value) || null,
            reserveDate: ((_d = row.reserve_date) === null || _d === void 0 ? void 0 : _d.value) || null,
            requirements: {
                officialTranscriptsReceived: row.trf_form_on_file,
                fundingPlan: row.funding_plan_status === 'Approved',
                orientationStarted: !!row.wwow_orientation_started_at,
            },
            courseActivity: courseMap[studentId] || [],
            contingencies: contMap[studentId] || [],
            lastUpdatedByPipelineAt: ((_e = row.etl_updated_at) === null || _e === void 0 ? void 0 : _e.value) || null
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
//# sourceMappingURL=sync-from-bq.js.map