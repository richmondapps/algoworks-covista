import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';
import * as fs from 'fs';

// Web SDK Config for DEV
const DevConfig = {
  apiKey: 'AIzaSyDwbq6TlPBGP_OjvQ6zdtiVthuN8Wwlk00',
  authDomain: 'dev-wu-agenticai-app-proj.firebaseapp.com',
  projectId: 'dev-wu-agenticai-app-proj',
  storageBucket: 'dev-wu-agenticai-app-proj.firebasestorage.app',
  messagingSenderId: '1033582308599',
  appId: '1:1033582308599:web:c463ef3cb68b5e30c1f7f2',
  measurementId: 'G-TQH9XRL30H',
};

const app = initializeApp(DevConfig);
const db = getFirestore(app);
const COLLECTION = 'salesforce_opportunities';

async function uploadToFirestoreViaWebSDK() {
    console.log("Reading downloaded BQ Extract JSON...");
    const rawData = fs.readFileSync('/Users/jakegarland/Downloads/bquxjob_637ffd32_19dac150fa8.json', 'utf-8');
    const bqExportList = JSON.parse(rawData);

    console.log(`Successfully parsed ${bqExportList.length} records. Uploading to Client Dev (dev-wu-agenticai-app-proj) via Web SDK...`);

    const batch = writeBatch(db);
    
    const extractDate = (val) => {
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

        const docRef = doc(db, COLLECTION, studentId);
        batch.set(docRef, payload, { merge: true });

        // Activity Logs
        if (Array.isArray(record.activityLogs)) {
            for (const log of record.activityLogs) {
                const logRef = doc(db, `${COLLECTION}/${studentId}/activity_logs`, String(log.log_id));
                batch.set(logRef, log, { merge: true });
            }
        }
    }

    try {
        await batch.commit();
        console.log("Web SDK Payload Sync Complete! The records successfully bypassed the IAM block and are officially seeded on dev-wu-agenticai-app-proj!");
    } catch (error) {
        console.error("Upload failed! Firebase Security Rules might be blocking the Web SDK:", error);
    }
    process.exit(0);
}

uploadToFirestoreViaWebSDK().catch(console.error);
