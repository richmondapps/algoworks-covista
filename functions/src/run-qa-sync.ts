
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const qaApp = initializeApp({ projectId: 'algoworks-dev' }, 'qaApp');
const qaDb = getFirestore(qaApp);

const COLLECTION = 'salesforce_opportunities';

async function forceSeedQA() {
    console.log("Reading downloaded BQ Extract JSON...");
    
    // Read the directly downloaded BQ JSON Payload containing all relations
    const rawData = fs.readFileSync('/Users/jakegarland/Downloads/bquxjob_637ffd32_19dac150fa8.json', 'utf-8');
    const bqExportList = JSON.parse(rawData);

    console.log(`Successfully parsed ${bqExportList.length} records. Commencing upload to algoworks-dev...`);

    const batch = qaDb.batch();
    
    // BQ Export shapes dates differently when it is a JSON download vs a node-bigquery client stream. 
    // They are raw strings rather than {value: "YYYY-MM-DD"}. We must cleanly parse them:
    const extractDate = (val: any) => {
        if (!val) return null;
        if (typeof val === 'object' && val.value) return val.value;
        return val;
    };

    for (const record of bqExportList) {
        const row = record.core;
        const studentId = String(row.student_id);

        const payload = {
            studentId,
            studentName: row.student_name,
            termCode: row.term_code,
            termDescription: row.term_desc,
            institution: row.institution,
            status: row.status_stage,
            enrollmentSpecialist: row.enrollment_specialist_name,

            programStartDate: extractDate(row.program_start_date),
            reserveDate: extractDate(row.reserve_date),
            censusDate: extractDate(row.census_date),
            fundingType: row.funding_type || null,

            timeToProgramStartDays: row.time_to_program_start_days ? Number(row.time_to_program_start_days) : null,
            timeSinceReserveDays: row.time_since_reserve_days ? Number(row.time_since_reserve_days) : null,

            syncTimestamp: Date.now(),
            lastUpdatedAt: extractDate(row.last_updated_at)
        };

        const docRef = qaDb.collection(COLLECTION).doc(studentId);
        batch.set(docRef, payload, { merge: true });

        // Activity Logs
        if (Array.isArray(record.activityLogs)) {
            for (const log of record.activityLogs) {
                const logRef = docRef.collection('activity_logs').doc(String(log.log_id));
                batch.set(logRef, log, { merge: true });
            }
        }
        
        // Courses
        if (Array.isArray(record.courses)) {
            for (const course of record.courses) {
                const courseRef = docRef.collection('courses').doc(String(course.course_identification));
                batch.set(courseRef, course, { merge: true });
            }
        }

        // Contingencies
        if (Array.isArray(record.contingencies)) {
            for (const cont of record.contingencies) {
                const contRef = docRef.collection('contingencies').doc(String(cont.contingency_requirement));
                batch.set(contRef, cont, { merge: true });
            }
        }
    }

    await batch.commit();
    console.log("Migration Complete! The complete hierarchical data contract is officially seeded on QA!");
    process.exit(0);
}

forceSeedQA().catch(console.error);
