import * as admin from 'firebase-admin';
import * as fs from 'fs';

// Use Application Default Credentials
admin.initializeApp();

const db = admin.firestore();

async function main() {
    console.log("Fetching student document A00302996...");
    const docRef = db.collection('salesforce_opportunities').doc('A00302996');
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
        console.log("Document does not exist.");
        return;
    }
    
    const data = docSnap.data();
    
    console.log("Fetching subcollection ai_insights/latest...");
    const latestRef = docRef.collection('ai_insights').doc('latest');
    const latestSnap = await latestRef.get();
    
    const output = {
        root_data: data,
        subcollection_data: latestSnap.exists ? latestSnap.data() : null
    };
    
    fs.writeFileSync('student_debug.json', JSON.stringify(output, null, 2));
    console.log("Saved to student_debug.json");
    process.exit(0);
}

main().catch(console.error);
