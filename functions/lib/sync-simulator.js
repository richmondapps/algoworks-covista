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
exports.manualSyncBQtoFirestore = exports.updateBigQueryMockData = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const bigquery_1 = require("@google-cloud/bigquery");
const bq = new bigquery_1.BigQuery();
exports.updateBigQueryMockData = (0, https_1.onCall)(async (request) => {
    const { studentUid, loginAccreditedDate, loginNonAccreditedDate, discussionDate, transcriptCleared, fundingComplete, wwowStarted, startDate, reserveDate } = request.data;
    const projectId = process.env.GCLOUD_PROJECT || "dev-wu-agenticai-app-proj";
    try {
        // Course level tracking (Accredited)
        if (loginAccreditedDate || discussionDate) {
            let setQuery = "etl_updated_at = CURRENT_TIMESTAMP()";
            if (loginAccreditedDate)
                setQuery += `, first_login_at = '${loginAccreditedDate}'`;
            if (discussionDate)
                setQuery += `, first_discussion_post_at = '${discussionDate}'`;
            await bq.query(`UPDATE \`${projectId}.covista_demo.student_courses\` 
                            SET ${setQuery}
                            WHERE student_id = '${studentUid}' AND is_accredited = TRUE`);
        }
        // Course level tracking (Non-Accredited)
        if (loginNonAccreditedDate) {
            await bq.query(`UPDATE \`${projectId}.covista_demo.student_courses\` 
                            SET etl_updated_at = CURRENT_TIMESTAMP(), first_login_at = '${loginNonAccreditedDate}'
                            WHERE student_id = '${studentUid}' AND is_accredited = FALSE`);
        }
        // Transcripts/Contingencies level tracking
        if (transcriptCleared !== undefined) {
            const status = transcriptCleared ? 'CLEARED' : 'PENDING';
            await bq.query(`UPDATE \`${projectId}.covista_demo.student_contingencies\` 
                            SET contingency_status = '${status}', etl_updated_at = CURRENT_TIMESTAMP() 
                            WHERE student_id = '${studentUid}' AND contingency_type = 'Official Transcript'`);
        }
        // Student Core level tracking (Funding, WWOW, Dates)
        if (fundingComplete !== undefined || wwowStarted !== undefined || startDate || reserveDate) {
            let coreUpdates = "etl_updated_at = CURRENT_TIMESTAMP()";
            if (fundingComplete !== undefined)
                coreUpdates += `, funding_plan_status = '${fundingComplete ? 'Complete' : 'Pending'}'`;
            if (wwowStarted !== undefined)
                coreUpdates += `, wwow_orientation_started_at = ${wwowStarted ? 'CURRENT_TIMESTAMP()' : 'NULL'}`;
            if (startDate)
                coreUpdates += `, program_start_date = '${startDate}'`;
            if (reserveDate)
                coreUpdates += `, reserve_date = '${reserveDate}'`;
            await bq.query(`UPDATE \`${projectId}.covista_demo.student_core\` 
                            SET ${coreUpdates}
                            WHERE student_id = '${studentUid}'`);
        }
        return { success: true };
    }
    catch (error) {
        throw new https_1.HttpsError('internal', 'BQ Write Failed ' + JSON.stringify(error));
    }
});
exports.manualSyncBQtoFirestore = (0, https_1.onCall)(async (request) => {
    const db = admin.firestore();
    const projectId = process.env.GCLOUD_PROJECT || "dev-wu-agenticai-app-proj";
    try {
        // DELTA QUERY: For the prototype demo, we will pull all students directly to prevent out-of-bounds dropoffs.
        // In production, you would re-enable the (etl_updated_at > 1 HOUR) logic to optimize bandwidth.
        const studentQuery = `
            SELECT c.*,
            ARRAY(SELECT AS STRUCT * FROM \`${projectId}.covista_demo.student_courses\` WHERE student_id = c.student_id) as courses,
            ARRAY(SELECT AS STRUCT * FROM \`${projectId}.covista_demo.student_contingencies\` WHERE student_id = c.student_id) as contingencies
            FROM \`${projectId}.covista_demo.student_core\` c
        `;
        const [rows] = await bq.query(studentQuery);
        if (!rows || rows.length === 0)
            return { success: true, count: 0 };
        for (const student of rows) {
            // Evaluated Facts
            const validCourses = student.courses.filter((c) => c.is_accredited === true);
            const registeredCourses = validCourses.some((c) => c.course_registration_status === 'Registered');
            const hasMissingContingencies = student.contingencies.some((c) => c.contingency_status !== 'CLEARED');
            const hasSatisfiedLogin = validCourses.some((c) => c.first_login_at !== null);
            const hasDiscussionPost = validCourses.some((c) => c.first_discussion_post_at !== null);
            // Check if discussion post was submitted before Census Day (Program Start + 10 Days)
            let censusCheck = false;
            if (hasDiscussionPost && student.program_start_date) {
                // Approximate Census Date Math
                const censusDateMs = new Date(student.program_start_date.value).getTime() + (10 * 24 * 60 * 60 * 1000);
                censusCheck = validCourses.some((c) => c.first_discussion_post_at && new Date(c.first_discussion_post_at.value).getTime() <= censusDateMs);
            }
            const requirements = {
                fundingPlan: student.funding_plan_status === 'Complete',
                courseRegistration: registeredCourses,
                wwowOrientationStarted: student.wwow_orientation_started_at !== null,
                officialTranscriptsReceived: !hasMissingContingencies,
                orientationStarted: hasSatisfiedLogin, // Maps to 'Logged into Course'
                firstAssignmentSubmitted: hasDiscussionPost,
                assignmentByCensusDay: censusCheck
            };
            // Calculate Chronological Deltas
            let timeUntilClassStartDays = 0;
            if (student.program_start_date) {
                const startString = student.program_start_date.value || student.program_start_date;
                const startDate = new Date(startString);
                const diffTime = startDate.getTime() - new Date().getTime();
                timeUntilClassStartDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
            let timeSinceReserveDays = 0;
            if (student.reserve_date) {
                const reserveString = student.reserve_date.value || student.reserve_date;
                const recDate = new Date(reserveString);
                const diffReserve = new Date().getTime() - recDate.getTime();
                timeSinceReserveDays = Math.ceil(diffReserve / (1000 * 60 * 60 * 24));
            }
            // Calculate Architectural Risk Level
            let riskIndicator = 'Low';
            const missingCount = Object.values(requirements).filter(v => v === false).length;
            if (missingCount >= 4 || (missingCount >= 2 && timeUntilClassStartDays <= 14)) {
                riskIndicator = 'High';
            }
            else if (missingCount > 0 && timeSinceReserveDays >= 14) {
                // If they reserved over 2 weeks ago and are STILL missing items, elevate to High Risk
                riskIndicator = 'High';
            }
            else if (missingCount > 0 && timeSinceReserveDays > 3) {
                // Give them a 3 day grace period after reserving before triggering Medium risk warnings
                riskIndicator = 'Medium';
            }
            // Migrated to 'student_records' to bypass legacy client sockets from reseeding 'students'
            await db.collection("salesforce_opportunities").doc(student.student_id).set({
                studentUid: student.student_id,
                name: student.full_name,
                requirements,
                timeUntilClassStartDays,
                timeSinceReserveDays,
                riskIndicator,
                actionRequired: missingCount > 0,
                engagementLevel: hasDiscussionPost ? 'High' : (hasSatisfiedLogin ? 'Medium' : 'Low'),
                lastSyncExecutedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        return { success: true, count: rows.length };
    }
    catch (error) {
        throw new https_1.HttpsError("internal", "BigQuery Sync Failed.");
    }
});
//# sourceMappingURL=sync-simulator.js.map