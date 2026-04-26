const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });
const db = admin.firestore();

async function run() {
    const doc = await db.collection('salesforce_opportunities').doc('A01304514').get();
    console.log(JSON.stringify(doc.data(), null, 2));
}
run();
