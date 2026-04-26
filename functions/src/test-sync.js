import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'dev-wu-agenticai-app-proj' });

// Load compiled TS directly
const { syncBigQueryNative } = require('./lib/sync-from-bq.js');

async function trigger() {
    try {
        console.log('Triggering BigQuery Sync manually via node script...');
        // Mock a CallableRequest wrapper since syncBigQuery is internal but exported wrapped
        // Wait, syncBigQuery is not exported, only syncBigQueryNative.
        // We can just run the compiled js natively? No, sync-from-bq.js does not export syncBigQuery itself.
        // Let's just run onBqSyncTrigger with a mock event
    } catch (e) {
        console.error(e);
    }
}
// Actually, let's just make a script that imports BigQuery and does the sync logic, OR we can modify index.ts to export syncBigQuery un-wrapped.
