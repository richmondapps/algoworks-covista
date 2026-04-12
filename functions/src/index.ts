import { GoogleAuth } from 'google-auth-library';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
// import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { VertexAI } from '@google-cloud/vertexai';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

/**
 * Fields written by the Python agent or used as UI/bookkeeping flags.
 * Changes to these fields do NOT represent upstream ingestion changes and must
 * never re-trigger AI orchestration (recursion guard).
 */
const DERIVED_FIELDS = [
  // Written by Python agent
  'agentTrace',
  'emailDraft',
  'smsDraft',
  'engagementRisk',
  'readinessRisk',
  'metrics',
  'nextBestActions',
  'generatedAt',
  'aiInsights', // legacy AI container
  // UI / bookkeeping flags
  'isGeneratingAi',
  'syncTimestamp',
  'lastAiError',
];

function stripDerived(doc: Record<string, any> | undefined): Record<string, any> {
  if (!doc) return {};
  const clean: Record<string, any> = { ...doc };
  for (const f of DERIVED_FIELDS) delete clean[f];
  return clean;
}

/**
 * Background trigger — orchestrates AI recomputation when upstream student
 * data changes in Firestore (via BQ sync, Airflow, Pub/Sub, or manual
 * "Regenerate" button in the Angular UI which writes { isGeneratingAi: true }).
 *
 * Recursion guard: derived-only writes (AI write-back, UI flags) are detected
 * via DERIVED_FIELDS blacklist and silently skipped to prevent infinite loops.
 *
 * TODO: When the Python agent is decoupled into separate core_agent and
 * comms_agent microservices, add a detectRouteFlags(before, after) helper
 * here to send { route: ['comms_agent'] } for notes-only changes, etc.
 */
export const syncAiInsightsOnUpdate = onDocumentUpdated(
  { document: 'salesforce_opportunities/{studentId}', retry: false },
  async (event) => {
    const studentUid = event.params.studentId;

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      console.log(`[syncAiInsightsOnUpdate] No data found for ${studentUid}`);
      return;
    }

    // --- Recursion guard ---
    const upstreamChanged =
      JSON.stringify(stripDerived(beforeData)) !==
      JSON.stringify(stripDerived(afterData));

    // Explicit force: UI writes { isGeneratingAi: true } to trigger regenerate
    const forceRegenerate =
      beforeData.isGeneratingAi !== true && afterData.isGeneratingAi === true;

    if (!upstreamChanged && !forceRegenerate) {
      console.log(
        `[recursionGuard] No upstream change and no force regenerate. Skipping ${studentUid}.`,
      );
      return;
    }

    console.log(
      `[trigger] Proceeding for ${studentUid} — upstreamChanged=${upstreamChanged}, forceRegenerate=${forceRegenerate}`,
    );

    try {
      // Re-fetch the latest full snapshot so the agent always works with
      // the most current state, regardless of write ordering.
      const latestDoc = await db.collection('salesforce_opportunities').doc(studentUid).get();
      const latestData = latestDoc.data();
      if (!latestData) {
        console.warn(`[trigger] Document disappeared before AI call: ${studentUid}`);
        return;
      }

      const targetHttp = 'https://python-data-agent-1033582308599.us-central1.run.app';
      const auth = new GoogleAuth();
      const client = await auth.getIdTokenClient(targetHttp);

      const response = await client.request({
        url: `${targetHttp}/generate-insights`,
        method: 'POST',
        data: { studentUid, dataContext: latestData },
      }) as any;

      if (!response.status || response.status >= 400) {
        console.error(`[trigger] Python agent returned error status: ${response.status}`);
      } else {
        const aiPayload = response.data;
        await db.collection('salesforce_opportunities').doc(studentUid).set(
          { ...aiPayload, isGeneratingAi: false },
          { merge: true },
        );
        console.log(`[trigger] Insights updated for ${studentUid}`);
      }
    } catch (err) {
      console.error(`[syncAiInsightsOnUpdate] Python agent failure for ${studentUid}:`, err);
      // Reset flag so the UI doesn't stay stuck on the loading spinner.
      // This write only touches DERIVED_FIELDS so the guard will skip it.
      try {
        await db.collection('salesforce_opportunities').doc(studentUid).set(
          {
            isGeneratingAi: false,
            lastAiError: {
              message: err instanceof Error ? err.message : String(err),
              at: new Date().toISOString(),
            },
          },
          { merge: true },
        );
      } catch (cleanupErr) {
        console.error(`[syncAiInsightsOnUpdate] Failed to reset isGeneratingAi flag:`, cleanupErr);
      }
    }
  },
);

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/**
 * Aggregate checklists to update main requirements
 */
export const aggregateChecklistsOnUpdate = onDocumentWritten('salesforce_opportunities/{studentId}/personalized_checklists/{chkId}', async (event) => {
  const studentUid = event.params.studentId;
  
  console.log(`Checklist updated for student: ${studentUid}`);
  
  try {
      const checklistsSnapshot = await admin.firestore().collection('salesforce_opportunities').doc(studentUid).collection('personalized_checklists').get();
      
      const requirements: any = {};
      
      checklistsSnapshot.forEach(doc => {
          const id = doc.id;
          const satisfied = doc.data().is_satisfied === true;
          
          if (id === 'initial_portal_login') requirements.orientationStarted = satisfied;
          if (id === 'fafsa_submission') {
              requirements.fafsaSubmitted = satisfied;
              requirements.fundingPlan = satisfied;
          }
          if (id === 'course_registration') requirements.courseRegistration = satisfied;
          if (id === 'wwow_login') requirements.wwowOrientationStarted = satisfied;
          if (id === 'contingencies') {
              requirements.officialTranscriptsReceived = satisfied;
              requirements.nursingLicenseReceived = satisfied;
          }
          if (id === 'logged_into_course') requirements.firstAssignmentSubmitted = satisfied; // Mapped loosely for test schema
          if (id === 'class_participation') requirements.assignmentByCensusDay = satisfied; 
      });
      
      // Update parent, naturally invoking syncAiInsightsOnUpdate
      await admin.firestore().collection('salesforce_opportunities').doc(studentUid).set({
          requirements
      }, { merge: true });
      
      console.log(`Requirements updated`);
  } catch (err) {
      console.error(`Failed to sync requirements.`, err);
  }
});

/**
 * Function to query student documents
 */
export const queryStudentDocument = onCall({ cors: true }, async (request) => {
  const { studentUid, fileName, query } = request.data;
  if (!studentUid || !fileName || !query) {
    throw new HttpsError('invalid-argument', 'Missing uid, fileName, or query');
  }

  try {
    console.log(
      `Querying document: ${fileName}`,
    );
    const filePath = `uploads/${studentUid}/${fileName}`;
    const bucket = admin.storage().bucket();
    const [metadata] = await bucket.file(filePath).getMetadata();
    const mimeType = metadata.contentType || 'application/pdf';

    const fileUri = `gs://${bucket.name}/${filePath}`;

    const vertex_ai = new VertexAI({
      project: process.env.GCLOUD_PROJECT || 'dev-wu-agenticai-app-proj',
      location: 'us-central1',
    });
    const model = 'gemini-2.5-flash';

    const generativeModel = vertex_ai.preview.getGenerativeModel({
      model: model,
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.2,
      },
    });

    const reqPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri, mimeType } },
            {
              text: `You are an expert financial aid and academic document reviewer. Read the attached file and explicitly answer the following question or perform the summary requested. \n\nQuery: "${query}"\n\nOnly return the plain text answer.`,
            },
          ],
        },
      ],
    };

    const resp = await generativeModel.generateContent(reqPayload);
    const responseText =
      resp.response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No response generated.';



    return { success: true, answer: responseText.trim() };
  } catch (e: any) {
    console.error(
      '[queryStudentDocument] Vertex AI Document Parsing Failed',
      e,
    );
    throw new HttpsError('internal', `Vertex AI Parsing Error: ${e.message}`);
  }
});

// ------------------------------------------------------------------
// Manual Pub/Sub Sync Simulator
export * from './sync-simulator';
