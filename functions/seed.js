const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'dev-wu-agenticai-app-proj' // Adjust as needed
});

const db = admin.firestore();

const targetIds = ['A00302996', 'A00437050', 'A00409782'];

async function run() {
  const oppsRef = db.collection('salesforce_opportunities');
  const snapshot = await oppsRef.get();
  
  let foundCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    // Check if document ID or internal studentUid or id matches
    if (targetIds.includes(doc.id) || targetIds.includes(data.studentUid) || targetIds.includes(data.id)) {
      foundCount++;
      const currentName = data.name || '';
      
      let newName = currentName;
      if (!currentName.includes('Test Subject')) {
        newName = `${currentName} - Test Subject`;
      }
      
      console.log(`Updating student: ${doc.id} mapped to ${newName}`);
      
      // Update Name
      await doc.ref.update({ name: newName });
      
      // Clear out old logs
      const logsRef = doc.ref.collection('activity_logs');
      const oldLogs = await logsRef.get();
      for (const old of oldLogs.docs) {
          await old.ref.delete();
      }

      // Inject 14-day mock data structure
      const now = new Date();
      const createLog = async (cat, name, type, direction, daysAgo) => {
        const d = new Date(now);
        d.setDate(now.getDate() - daysAgo);
        await logsRef.add({
          log_id: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          student_id: doc.id,
          activity_category: cat,
          activity_name: name,
          activity_datetime: d.toISOString(),
          communication_type: type,
          interaction_direction: direction,
          task_status: direction === 'inbound' ? 'Received' : 'Sent',
          actor: 'System'
        });
      };

      // Generate a mix of objects specifically to test aggregations
      await createLog('SystemEvent', 'wow_login', null, null, 2);
      await createLog('SystemEvent', 'wow_login', null, null, 4);
      await createLog('SystemEvent', 'wow_login', null, null, 5);
      await createLog('SystemEvent', 'wow_login', null, null, 10);
      await createLog('SystemEvent', 'wow_login', null, null, 11);
      
      await createLog('SystemEvent', 'course_login', null, null, 1);
      await createLog('SystemEvent', 'course_login', null, null, 3);
      
      await createLog('Engagement', 'Email Thread', 'Email', 'inbound', 5);
      await createLog('Engagement', 'Financial Question', 'Email', 'inbound', 8);
      
      await createLog('Engagement', 'Quick question', 'Text', 'inbound', 2);
      await createLog('Engagement', 'Confirming receipt', 'Text', 'inbound', 6);
      await createLog('Engagement', 'Sounds good', 'Text', 'inbound', 7);

      await createLog('Engagement', 'Advising Call', 'Phone', 'inbound', 4);

      // Add one out of bounds (> 14 days) to ensure filter works!
      await createLog('Engagement', 'Old Email', 'Email', 'inbound', 20);
      await createLog('SystemEvent', 'wow_login', null, null, 18);
      
      console.log(`Finished injecting 15 mock logs for ${newName}`);
    }
  }
  console.log(`Found and updated ${foundCount} exact test subjects.`);
}

run().catch(console.error);
