import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
// import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
// import { defineSecret } from 'firebase-functions/params';
// import sgMail = require('@sendgrid/mail');
// import twilio = require('twilio');
import { VertexAI } from '@google-cloud/vertexai';
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Define the secret that was configured in GCP Secret Manager
// const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
// const twilioSid = defineSecret('TWILIO_ACCOUNT_SID');
// const twilioToken = defineSecret('TWILIO_AUTH_TOKEN');
// const twilioPhone = defineSecret('TWILIO_PHONE_NUMBER');

/**
 * Cloud Function to trigger an HTML Email out to the Opportunity via SendGrid.
 * It passes the specific Student UID securely into SendGrid's custom_args payload.
 */
// export const sendOpportunityEmail = onCall({ secrets: [sendgridApiKey] }, async (request) => {
//     sgMail.setApiKey(sendgridApiKey.value());

//     console.log("[sendOpportunityEmail] Cloud Function Invoked.");
//     console.log("[sendOpportunityEmail] Request Data:", JSON.stringify(request.data));

//     const { studentUid, email, name, daysLeft, documentName, uploadLink, customHtml } = request.data;

//     if (!studentUid || !email) {
//         console.error("[sendOpportunityEmail] Execution failed: Missing UID or Email");
//         throw new HttpsError("invalid-argument", "Missing UID or Email");
//     }

//     const emailBodyTxt = customHtml
//         ? `${customHtml}\n\nPlease upload your documents here: ${uploadLink}`
//         : `Hi ${name},\n\nYou have ${daysLeft} days left to provide your [${documentName}]. Please upload here: ${uploadLink}`;

//     const emailBodyHtml = customHtml
//         ? `<p>${customHtml.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p><br><br><p><a href="${uploadLink}" style="display:inline-block;padding:12px 24px;background-color:#0176d3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-family:sans-serif;">Secure Document Upload Link</a></p>`
//         : `<p>Hi ${name},</p><p>You have <strong>${daysLeft} days</strong> left to provide your <strong>[${documentName}]</strong>.</p><p><a href="${uploadLink}" style="display:inline-block;padding:12px 24px;background-color:#0176d3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-family:sans-serif;">Secure Document Upload Link</a></p>`;

//     try {
//         console.log(`[sendOpportunityEmail] Appending Sent stat to Firestore for ${studentUid}`);
//         await db.collection("students").doc(studentUid).set({
//             stats: {
//                 emailsSent: admin.firestore.FieldValue.increment(1),
//                 lastSentAt: admin.firestore.FieldValue.serverTimestamp()
//             },
//             communications: admin.firestore.FieldValue.arrayUnion({
//                 type: 'Email',
//                 status: 'Sent',
//                 timestamp: new Date().toISOString(),
//                 body: emailBodyTxt,
//                 agentName: 'System Triggered'
//             })
//         }, { merge: true });
//         console.log(`[sendOpportunityEmail] Successfully updated local stats for ${studentUid}`);
//     } catch (e) {
//         console.error("[sendOpportunityEmail] Failed to append sent tracking against Uid", e);
//     }

//     const msg = {
//         to: email,
//         from: "jgarland@richmondapps.com", // Should be verified in your SendGrid Account
//         subject: "Urgent: Missing R2C Documents Required",
//         text: emailBodyTxt,
//         html: emailBodyHtml,
//         custom_args: {
//             student_uid: studentUid,
//             campaign: "r2c_missing_docs",
//             sent_at_ms: Date.now().toString()
//         },
//     };

//     try {
//         console.log("[sendOpportunityEmail] Dispactching Payload to SendGrid...");
//         const response = await sgMail.send(msg);
//         console.log("[sendOpportunityEmail] SendGrid API Response:", response);
//         return { success: true };
//     } catch (error) {
//         console.error("[sendOpportunityEmail] Error sending exact email via SendGrid", error);
//         throw new HttpsError("internal", "SendGrid failed.");
//     }
// });

/**
 * Cloud Function to trigger SMS out to the Opportunity via Twilio.
 */
// export const sendOpportunitySms = onCall({ secrets: [twilioSid, twilioToken, twilioPhone] }, async (request) => {
//     console.log("[sendOpportunitySms] Cloud Function Invoked.");

//     const client = twilio(twilioSid.value(), twilioToken.value());
//     const fromPhone = twilioPhone.value();

//     const { studentUid, phone, name, daysLeft, documentName, uploadLink, customText } = request.data;
//     if (!studentUid || !phone) {
//         console.error("[sendOpportunitySms] Execution failed: Missing UID or Phone");
//         throw new HttpsError("invalid-argument", "Missing UID or Phone");
//     }

//     const formattedPhone = phone.replace(/[^\d+]/g, '');
//     const smsBodyTxt = customText
//         ? `${customText}\n\nUpload securely here: ${uploadLink}`
//         : `Hi ${name}, you have ${daysLeft} days left to provide your [${documentName}]. Please upload securely here: ${uploadLink}`;

//     try {
//         console.log(`[sendOpportunitySms] Sending Twilio SMS to ${formattedPhone} for ${name} (${studentUid}).`);

//         const message = await client.messages.create({
//             body: smsBodyTxt,
//             from: fromPhone,
//             to: formattedPhone,
//             statusCallback: `https://us-central1-algoworks-dev.cloudfunctions.net/twilioWebhook?studentUid=${studentUid}`
//         });

//         console.log(`[sendOpportunitySms] Twilio Message SID: ${message.sid}`);

//         await db.collection("students").doc(studentUid).set({
//             stats: {
//                 smsSent: admin.firestore.FieldValue.increment(1),
//                 lastSmsSentAt: admin.firestore.FieldValue.serverTimestamp()
//             },
//             communications: admin.firestore.FieldValue.arrayUnion({
//                 type: 'SMS',
//                 status: 'Sent',
//                 timestamp: new Date().toISOString(),
//                 body: smsBodyTxt,
//                 agentName: 'System Triggered'
//             })
//         }, { merge: true });

//         return { success: true, messageSid: message.sid };
//     } catch (e: any) {
//         console.error("[sendOpportunitySms] Twilio execution failed:", e);
//         if (e.code) {
//             console.error(`Twilio Error Code: ${e.code}`);
//         }
//         if (e.message) {
//             console.error(`Twilio Error Message: ${e.message}`);
//         }
//         throw new HttpsError("internal", `Twilio SMS failed: ${e.message || 'Unknown error'}`);
//     }
// });

/**
 * Twilio Webhook HTTP Endpoint to track SMS Delivery Statuses.
 * Expected URL: https://us-central1-algoworks-dev.cloudfunctions.net/twilioWebhook
 */
// export const twilioWebhook = onRequest(async (req: any, res: any) => {
//     console.log("[twilioWebhook] Twilio Status Webhook Fired!");

//     const MessageStatus = req.body.MessageStatus || req.query.MessageStatus;
//     const MessageSid = req.body.MessageSid || req.query.MessageSid;
//     const ErrorCode = req.body.ErrorCode || req.query.ErrorCode;

//     const studentUid = req.query.studentUid;

//     console.log(`[twilioWebhook] Event: ${MessageStatus} for SID: ${MessageSid}, UID: ${studentUid}, ErrorCode: ${ErrorCode || 'None'}`);

//     if (!studentUid || !MessageStatus) {
//         console.warn("[twilioWebhook] Ignored payload missing targeted custom student UID or Status.");
//         res.status(200).send("Ignored");
//         return;
//     }

//     const studentRef = db.collection("students").doc(studentUid);
//     const timestamp = admin.firestore.FieldValue.serverTimestamp();

//     if (MessageStatus === "delivered") {
//         await studentRef.set({
//             stats: {
//                 lastSmsDeliveredAt: timestamp
//             },
//             communications: admin.firestore.FieldValue.arrayUnion({
//                 type: 'SMS',
//                 status: 'Delivered',
//                 timestamp: new Date().toISOString(),
//                 body: `Twilio delivery status update: ${MessageStatus}`,
//                 agentName: 'System Triggered'
//             })
//         }, { merge: true });
//         console.log(`[twilioWebhook] Documented successful SMS Delivery for UID: ${studentUid}`);
//     } else if (MessageStatus === "failed" || MessageStatus === "undelivered") {
//         console.error(`[twilioWebhook] SMS Failed/Undelivered for UID: ${studentUid}. Consider marking phone number invalid.`);
//         await studentRef.set({
//             communications: admin.firestore.FieldValue.arrayUnion({
//                 type: 'SMS',
//                 status: 'Failed',
//                 timestamp: new Date().toISOString(),
//                 body: `Twilio delivery failure: ${ErrorCode || 'Unknown error'}`,
//                 agentName: 'System Triggered'
//             })
//         }, { merge: true });
//     }

//     res.status(200).send("Processed");
// });

/**
 * SendGrid Event Webhook HTTP Endpoint
 * Expected URL: https://us-central1-algoworks-dev.cloudfunctions.net/sendgridWebhook
 * You provide this URL to SendGrid in their Webhook Settings.
 */
// export const sendgridWebhook = onRequest(async (req: any, res: any) => {
//     console.log("[sendgridWebhook] Webhook Fired!");

//     const events = req.body;
//     console.log("[sendgridWebhook] Events Payload:", JSON.stringify(events));

//     if (!events || !Array.isArray(events)) {
//         console.error("[sendgridWebhook] Invalid Payload format received.");
//         res.status(400).send("Invalid payload");
//         return;
//     }

//     const batch = db.batch();
//     let processedCount = 0;

//     for (const event of events) {
//         const studentUid = event.student_uid;
//         if (!studentUid) continue; // Not an R2C system email
//         const studentRef = db.collection("students").doc(studentUid);

//         const timestamp = admin.firestore.FieldValue.serverTimestamp();

//         if (event.event === "delivered") {
//             console.log(`[sendgridWebhook] Found 'Delivered' event for UID: ${studentUid}`);
//             processedCount++;
//             batch.set(studentRef, {
//                 stats: { lastDeliveredAt: timestamp },
//                 communications: admin.firestore.FieldValue.arrayUnion({
//                     type: 'Email',
//                     status: 'Delivered',
//                     timestamp: new Date().toISOString(),
//                     body: 'Email successfully delivered.',
//                     agentName: 'System Webhook'
//                 })
//             }, { merge: true });
//         }

//         if (event.event === "open") {
//             console.log(`[sendgridWebhook] Found 'Open' event for UID: ${studentUid}`);
//             processedCount++;
//             const sentMs = parseInt(event.sent_at_ms || '0', 10);
//             const openMs = (event.timestamp * 1000) || Date.now();
//             const openDelayMinutes = sentMs > 0 ? Math.round((openMs - sentMs) / 60000) : null;

//             batch.set(studentRef, {
//                 stats: {
//                     emailOpens: admin.firestore.FieldValue.increment(1),
//                     lastOpenedAt: timestamp,
//                     avgOpenDelayMinutes: openDelayMinutes
//                 },
//                 communications: admin.firestore.FieldValue.arrayUnion({
//                     type: 'Email',
//                     status: 'Opened',
//                     timestamp: new Date().toISOString(),
//                     body: 'Email opened by recipient.',
//                     agentName: 'System Webhook'
//                 })
//             }, { merge: true });
//         }

//         if (event.event === "click") {
//             console.log(`[sendgridWebhook] Found 'Click' event for UID: ${studentUid}`);
//             processedCount++;
//             batch.set(studentRef, {
//                 stats: {
//                     emailClicks: admin.firestore.FieldValue.increment(1),
//                     lastClickedAt: timestamp
//                 },
//                 communications: admin.firestore.FieldValue.arrayUnion({
//                     type: 'Email',
//                     status: 'Clicked',
//                     timestamp: new Date().toISOString(),
//                     body: 'Link clicked inside email.',
//                     agentName: 'System Webhook'
//                 })
//             }, { merge: true });
//         }
//     }

//     try {
//         if (processedCount > 0) {
//             console.log(`[sendgridWebhook] Committing ${processedCount} valid events to Firestore Batch...`);
//             await batch.commit();
//             console.log("[sendgridWebhook] Firestore Batch Committed Successfully.");
//         } else {
//             console.log("[sendgridWebhook] No valid R2C system events found in payload to commit.");
//         }
//         res.status(200).send("Processed");
//     } catch (err) {
//         console.error("[sendgridWebhook] Firestore batch update failed", err);
//         res.status(500).send("Internal Server Error");
//     }
// });

/**
 * Cloud Function to generate Next Best Action insights via Vertex AI gemini-3.1-pro-preview
 */
export const generateStudentInsights = onCall(async (request) => {
  const { studentUid, dataContext } = request.data;
  if (!studentUid) {
    throw new HttpsError('invalid-argument', 'Missing student UID');
  }

  try {
    console.log(`[generateStudentInsights] Proxying native JSON payload directly to Python Multi-Agent Architecture for UID: ${studentUid}`);
    console.log(`[LATENCY_TRACE] Bypassing native processing... Routing explicit HTTP tunnel to Python Server.`);

    const execStart = Date.now();
    const agentResponse = await fetch(
      'https://python-data-agent-668256868217.us-central1.run.app/generate-insights',
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
    
    console.log(`[generateStudentInsights] Successfully received deeply optimized AI profile from Python Orchestrator.`);
    console.log(`[LATENCY_TRACE] Python Orchestrator Execution finished in ${execDuration}ms / ${(execDuration / 1000).toFixed(2)} seconds!`);

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
 * Event-Driven AI Generation Architecture
 * Silently listens for structural updates to the salesforce_opportunities database and invokes the python-data-agent dynamically.
 * Explicitly guards against AI cyclic generations to prevent infinite network loops.
 */
export const syncAiInsightsOnUpdate = onDocumentUpdated('salesforce_opportunities/{studentId}', async (event) => {
  const studentUid = event.params.studentId;
  
  console.log(`\n======================================================`);
  console.log(`[EVENT_ARC_DIAGNOSTIC] -> syncAiInsightsOnUpdate NATIVELY FIRED!`);
  console.log(`[EVENT_ARC_DIAGNOSTIC] -> Target Collection: salesforce_opportunities`);
  console.log(`[EVENT_ARC_DIAGNOSTIC] -> Target UID: ${studentUid}`);
  console.log(`======================================================\n`);

  const beforeData = event.data?.before.data();
  const afterData = event.data?.after.data();

  if (!beforeData || !afterData) {
      console.log(`[EVENT_ARC_DIAGNOSTIC] -> HALTED: Missing before/after data structures.`);
      return;
  }

  // Critical Recursion Guard: Do not execute if the only change was a background completion update from the AI!
  if (beforeData.aiInsights?.generatedAt !== afterData.aiInsights?.generatedAt || 
      JSON.stringify(beforeData.aiInsights) !== JSON.stringify(afterData.aiInsights)) {
    console.log(`[syncAiInsightsOnUpdate] Change exclusively contained AI trace objects. Skipping to prevent loop.`);
    return;
  }

  console.log(`[syncAiInsightsOnUpdate] Structural Core Update Detected for UID: ${studentUid}. Invoking Generative Agent...`);
  try {
      const response = await fetch(
        'https://python-data-agent-668256868217.us-central1.run.app/generate-insights',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentUid, dataContext: afterData })
        }
      );
      if (!response.ok) {
          console.error(`[syncAiInsightsOnUpdate] Python agent async execution failure: ${response.status}`);
      } else {
          const aiPayload = await response.json();
          await db.collection('salesforce_opportunities').doc(studentUid).set(
            { aiInsights: aiPayload, isGeneratingAi: false },
            { merge: true },
          );
          console.log(`[syncAiInsightsOnUpdate] Successfully committed Phase 1 payload mapping to background container.`);
      }
  } catch (err) {
      console.error(`[syncAiInsightsOnUpdate] Fatal HTTP Fetch Exception:`, err);
  }
});

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/**
 * Event-Driven Aggregator for Personalized Checklists
 * Intercepts structural mutations inside the decoupled subcollection and aggregates
 * the boolean values directly into the root 'requirements' object of the active payload.
 * This triggers syncAiInsightsOnUpdate automatically.
 */
export const aggregateChecklistsOnUpdate = onDocumentWritten('salesforce_opportunities/{studentId}/personalized_checklists/{chkId}', async (event) => {
  const studentUid = event.params.studentId;
  
  console.log(`[aggregateChecklistsOnUpdate] Detected Checklist Mutation for UID: ${studentUid}`);
  
  try {
      const checklistsSnapshot = await admin.firestore().collection('salesforce_opportunities').doc(studentUid).collection('personalized_checklists').get();
      
      const requirements: any = {};
      
      checklistsSnapshot.forEach(doc => {
          const id = doc.id;
          const satisfied = doc.data().is_satisfied === true;
          
          if (id === 'initial_portal_login') requirements.orientationStarted = satisfied;
          if (id === 'fafsa_submission') requirements.fafsaSubmitted = satisfied;
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
      
      console.log(`[aggregateChecklistsOnUpdate] Successfully committed aggregated requirements payload to root.`);
  } catch (err) {
      console.error(`[aggregateChecklistsOnUpdate] Failed to sync subcollection up to root.`, err);
  }
});

/**
 * Cloud Function to directly query or summarize an uploaded student document on demand.
 * This dynamically utilizes Gemini's native File API integrations simply by translating
 * the existing Firebase Storage mapping into a vector-ready GS:// URI.
 */
export const queryStudentDocument = onCall(async (request) => {
  const { studentUid, fileName, query } = request.data;
  if (!studentUid || !fileName || !query) {
    throw new HttpsError('invalid-argument', 'Missing uid, fileName, or query');
  }

  try {
    console.log(
      `[queryStudentDocument] Initiating Gemini File Parse for: ${fileName}`,
    );
    const filePath = `uploads/${studentUid}/${fileName}`;
    const bucket = admin.storage().bucket();
    const [metadata] = await bucket.file(filePath).getMetadata();
    const mimeType = metadata.contentType || 'application/pdf';

    // Native mapping to Vertex AI without requiring secondary Vector DB or local copies
    const fileUri = `gs://${bucket.name}/${filePath}`;

    const vertex_ai = new VertexAI({
      project: process.env.GCLOUD_PROJECT || 'algoworks-dev',
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

    // Pack the multimodal prompt with the direct GS URI and the user's natural language question
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

    // --- Custom Token Reporting for CIO Demo ---
    const usage = resp.response.usageMetadata;
    if (usage) {
      const inTokens = usage.promptTokenCount || 0;
      const outTokens = usage.candidatesTokenCount || 0;

      // Exact Math for Gemini 2.5 Flash Pricing
      const inCost = (inTokens / 1000000) * 0.3;
      const outCost = (outTokens / 1000000) * 2.5;
      const totalCost = inCost + outCost;

      console.info(
        `[TOKEN_METRICS] Feature: Document Scanning | Input: ${inTokens} tokens ($${inCost.toFixed(6)}) | Output: ${outTokens} tokens ($${outCost.toFixed(6)}) | Total Exec Cost: $${totalCost.toFixed(7)}`,
      );
    }

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
