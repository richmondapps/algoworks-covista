const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'algoworks-dev' });
const db = admin.firestore();

async function wipeStudents() {
    console.log("Starting aggressive wipe of 'students' collection...");
    const snapshot = await db.collection('students').get();
    
    if (snapshot.empty) {
        console.log("Collection is already empty.");
        return;
    }
    
    let batch = db.batch();
    let count = 0;
    
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        if (count % 500 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    
    if (count > 0) {
        await batch.commit();
    }
    
    console.log(`Successfully wiped ${count} legacy dummy records.`);
}

wipeStudents().catch(console.error);
