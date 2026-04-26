import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const app = initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });
const db = getFirestore(app);

async function check() {
  const doc = await db.collection('salesforce_opportunities').doc('A00362587').get();
  console.log("EXISTS:", doc.exists);
  if(doc.exists) {
      console.log("aiInsights keys:", Object.keys(doc.data()?.aiInsights || {}));
  }
}
check().catch(console.error);
