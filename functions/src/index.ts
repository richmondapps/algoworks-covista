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
 * Cloud Function to generate Next Best Action insights via Vertex AI gemini-3.1-pro-preview
 */
export const generateStudentInsights = onCall({ cors: true }, async (request) => {
  const { studentUid, dataContext } = request.data;
  if (!studentUid) {
    throw new HttpsError('invalid-argument', 'Missing student UID');
  }

  try {
    console.log(`Generating insights for student: ${studentUid}`);

    const execStart = Date.now();
    const agentResponse = await fetch(
      'https://python-data-agent-1033582308599.us-central1.run.app/generate-insights',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUid, dataContext })
      },
    );
    
    if (!agentResponse.ok) {
       throw new Error(`Python Proxy Failed: ${agentResponse.statusText}`);
    }

    const aiPayload = await agentResponse.json();
    const execDuration = Date.now() - execStart;
    
    console.log(`Insights generated successfully in ${execDuration}ms`);

    // Append generated AI payload directly to the student record in Firestore
    await db.collection('salesforce_opportunities').doc(studentUid).set(
      { aiInsights: aiPayload },
      { merge: true },
    );

    return { success: true, aiInsights: aiPayload };
  } catch (e: any) {
    console.error('[generateStudentInsights] Python Pipeline Execution Failed', e);
    throw new HttpsError('internal', `Python Architecture Failed: ${e.message}`);
  }
});

/**
 * Cloud Function to explicitly command the disconnected Communications Agent explicitly via Vertex AI gemini-3.1-pro-preview
 */
export const generateStudentCommunications = onCall({ cors: true }, async (request) => {
  const { studentUid, dataContext } = request.data;
  if (!studentUid) {
    throw new HttpsError('invalid-argument', 'Missing student UID');
  }

  try {
    console.log(`Generating isolated communications for student: ${studentUid}`);

    const execStart = Date.now();
    const agentResponse = await fetch(
      'https://python-data-agent-1033582308599.us-central1.run.app/generate-comms',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentUid, dataContext })
      },
    );
    
    if (!agentResponse.ok) {
       throw new Error(`Python Proxy Failed: ${agentResponse.statusText}`);
    }

    const aiPayload = await agentResponse.json();
    const execDuration = Date.now() - execStart;
    
    console.log(`Communications generated successfully in ${execDuration}ms. Python natively managed DB writes.`);

    return { success: true, aiInsights: aiPayload.comms };
  } catch (e: any) {
    console.error('[generateStudentCommunications] Python Pipeline Execution Failed', e);
    throw new HttpsError('internal', `Python Architecture Failed: ${e.message}`);
  }
});

/**
 * Background trigger to generate insights on save
 */
export const syncAiInsightsOnUpdate = onDocumentUpdated('salesforce_opportunities/{studentId}', async (event) => {
  const studentUid = event.params.studentId;
  
  console.log(`Update triggered for studentId: ${studentUid}`);

  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!beforeData || !afterData) {
      console.log(`No data found`);
      return;
  }

  // check if ai insights triggered this update to avoid loops
  if (beforeData.aiInsights?.generatedAt !== afterData.aiInsights?.generatedAt || 
      JSON.stringify(beforeData.aiInsights) !== JSON.stringify(afterData.aiInsights)) {
    console.log(`Skipping update loop`);
    return;
  }

  console.log(`Triggering insight generation for: ${studentUid}`);
  try {

          const targetHttp = 'https://python-data-agent-1033582308599.us-central1.run.app';
          const auth = new GoogleAuth();
          const client = await auth.getIdTokenClient(targetHttp);

          
          const response = await client.request({
            url: `${targetHttp}/generate-insights`,
            method: 'POST',
            data: { studentUid, dataContext: afterData }
          }) as any;
      if (!response.status || response.status >= 400) {
          console.error(`Execution failure: ${response.status}`);
      } else {
          const aiPayload = response.data;
          await db.collection('salesforce_opportunities').doc(studentUid).set(
            { aiInsights: aiPayload, isGeneratingAi: false },
            { merge: true },
          );
          console.log(`Insights updated`);
      }
  } catch (err) {
      console.error(`Fetch exception:`, err);
  }
});

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
