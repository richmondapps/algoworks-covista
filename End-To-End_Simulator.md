# The Complete End-to-End BQ / Salesforce Simulator

You are 100% correct. I took a shortcut to prove the networking pipeline handled CORS and successfully solved the 30-minute block, but I didn't give you the fully-functional UI to actually *write* new test data directly into BigQuery first.

To properly demonstrate the architecture to the client, you need exactly what you described:
1. **The Form:** You check the boxes for Transcripts, pick the exact Login Date for courses, and click "Submit to BigQuery."
2. **The Sync:** You click the "Simulate Pub/Sub" button, the engine sweeps through BigQuery looking for updated rows, pulls down the new data, executes the Javascript logic, and updates Firestore.

Here is the fully functional code block to power both sides of your simulator.

---

### Step 1: The UI (Angular Simulator HTML)
*Replace `admin-simulator.component.html` with this interactive form for your specific students.*

```html
<div style="padding: 2rem; background: #f8fafc; font-family: sans-serif;">
  <h2>Enterprise Integration Simulator</h2>
  <p>Modify raw data directly in BigQuery. Then manually trigger the Sync Engine.</p>

  <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem;">
    <h3>Select Student to Modify in BigQuery:</h3>
    <select [(ngModel)]="selectedStudent" style="padding: 0.5rem; width: 100%; border-radius: 4px;">
      <option value="A00302996">Amy Collins</option>
      <option value="A00409782">Barbara Woods</option>
      <option value="A00437050">Angela Catour</option>
    </select>

    <h4>Action 1: Course Login (Student Portal)</h4>
    <label>First Login Timestamp:</label><br>
    <input type="datetime-local" [(ngModel)]="loginDate" style="padding: 0.5rem;"><br>

    <h4>Action 2: Manual Review (Salesforce ES View)</h4>
    <label>
      <input type="checkbox" [(ngModel)]="transcriptCleared"> 
      Official Transcript Cleared (CONT. Box)
    </label>

    <button (click)="writeToBigQuery()" [disabled]="isWriting" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #10b981; color: white;">
      {{ isWriting ? 'Updating BQ...' : '1. Submit to BigQuery' }}
    </button>
  </div>

  <button (click)="simulatePubSubSync()" [disabled]="isSyncing" style="width: 100%; padding: 1rem; background: #2563eb; color: white;">
    {{ isSyncing ? 'Running Delta Sync...' : '2. FORCE SYNC (Simulate Pub/Sub)' }}
  </button>
</div>
```

---

### Step 2: The Logic (Angular Simulator TS)
*Update your `admin-simulator.component.ts` to capture the form data and call the new BigQuery Write function.*

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-admin-simulator',
  standalone: true,
  imports: [CommonModule, FormsModule], // Note: You need FormsModule for ngModel
  templateUrl: './admin-simulator.component.html'
})
export class AdminSimulatorComponent {
  private functions = inject(Functions);
  
  selectedStudent = 'A00302996';
  loginDate = '';
  transcriptCleared = false;

  isWriting = false;
  isSyncing = false;

  async writeToBigQuery() {
    this.isWriting = true;
    try {
      const bqWriteFn = httpsCallable(this.functions, 'updateBigQueryMockData');
      await bqWriteFn({
        studentUid: this.selectedStudent,
        loginDate: this.loginDate ? new Date(this.loginDate).toISOString() : null,
        transcriptCleared: this.transcriptCleared
      });
      alert('Raw Data successfully injected into BigQuery System of Record!');
    } catch(e) { console.error('Write Failed:', e); }
    this.isWriting = false;
  }

  async simulatePubSubSync() {
    this.isSyncing = true;
    try {
      const syncFn = httpsCallable(this.functions, 'manualSyncBQtoFirestore');
      const res: any = await syncFn({});
      alert(res.data?.success ? `Synced ${res.data?.count} updated records.` : 'Sync failed!');
    } catch(e) { console.error('Sync error:', e); }
    this.isSyncing = false;
  }
}
```

---

### Step 3: The Cloud Functions (The Engine)
*In your `functions/src/sync-simulator.ts`, add the Write function, and update the Sync function to grab **all** recently updated rows dynamically.*

```typescript
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { BigQuery } from "@google-cloud/bigquery";

const bq = new BigQuery();

// 1. The Function to Write from the UI straight to BigQuery (Like Salesforce pushing data)
export const updateBigQueryMockData = onCall(async (request) => {
    const { studentUid, loginDate, transcriptCleared } = request.data;
    const projectId = process.env.GCLOUD_PROJECT || "algoworks-dev";

    try {
        // Update Course Login Date
        if (loginDate) {
            await bq.query(`UPDATE \`${projectId}.covista_demo.student_courses\` 
                            SET first_login_at = '${loginDate}', etl_updated_at = CURRENT_TIMESTAMP() 
                            WHERE student_id = '${studentUid}'`);
        }
        
        // Update Transcript Contingencies (Mimicking ES checking a box in SF)
        const status = transcriptCleared ? 'CLEARED' : 'PENDING';
        await bq.query(`UPDATE \`${projectId}.covista_demo.student_contingencies\` 
                        SET contingency_status = '${status}', etl_updated_at = CURRENT_TIMESTAMP() 
                        WHERE student_id = '${studentUid}' AND contingency_type = 'Official Transcript'`);
        
        return { success: true };
    } catch (error) { throw new HttpsError('internal', 'BQ Write Failed'); }
});


// 2. The Delta Sync (Finds all students who were updated in BQ in the last hour!)
export const manualSyncBQtoFirestore = onCall(async (request) => {
    const db = admin.firestore();
    const projectId = process.env.GCLOUD_PROJECT || "algoworks-dev";
    
    // DELTA QUERY: Only pull students modified in the last 1 hour
    const studentQuery = `
        SELECT c.*,
        ARRAY(SELECT AS STRUCT * FROM \`${projectId}.covista_demo.student_courses\` WHERE student_id = c.student_id) as courses,
        ARRAY(SELECT AS STRUCT * FROM \`${projectId}.covista_demo.student_contingencies\` WHERE student_id = c.student_id) as contingencies
        FROM \`${projectId}.covista_demo.student_core\` c
        WHERE c.student_id IN (
            SELECT student_id FROM \`${projectId}.covista_demo.student_courses\` WHERE etl_updated_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
            UNION DISTINCT
            SELECT student_id FROM \`${projectId}.covista_demo.student_contingencies\` WHERE etl_updated_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
        )
    `;

    const [rows] = await bq.query(studentQuery);
    if (!rows || rows.length === 0) return { success: true, count: 0 };

    for (const student of rows) {
        // The Javascript Logic Evaluation
        const validCourses = student.courses.filter((c: any) => c.is_accredited === true);
        const hasSatisfiedLogin = validCourses.some((c: any) => c.first_login_at !== null);
        const hasMissingContingencies = student.contingencies.some((c: any) => c.contingency_status !== 'CLEARED');
        
        await db.collection("students").doc(student.student_id).set({
            studentUid: student.student_id,
            name: student.full_name,
            requirements: {
                orientationStarted: hasSatisfiedLogin,
                officialTranscriptsReceived: !hasMissingContingencies
            },
            lastSyncExecutedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    
    return { success: true, count: rows.length };
});
```
