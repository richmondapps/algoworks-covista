import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { defineSecret } from "firebase-functions/params";
import sgMail = require("@sendgrid/mail");
import twilio = require("twilio");
import { VertexAI } from '@google-cloud/vertexai';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Define the secret that was configured in GCP Secret Manager
const sendgridApiKey = defineSecret("SENDGRID_API_KEY");
const twilioSid = defineSecret("TWILIO_ACCOUNT_SID");
const twilioToken = defineSecret("TWILIO_AUTH_TOKEN");
const twilioPhone = defineSecret("TWILIO_PHONE_NUMBER");

/**
 * Cloud Function to trigger an HTML Email out to the Opportunity via SendGrid.
 * It passes the specific Student UID securely into SendGrid's custom_args payload.
 */
export const sendOpportunityEmail = onCall({ secrets: [sendgridApiKey] }, async (request) => {
    // Now we initialize SendGrid directly inside the function where the secret has properly mounted
    sgMail.setApiKey(sendgridApiKey.value());

    console.log("[sendOpportunityEmail] Cloud Function Invoked.");
    console.log("[sendOpportunityEmail] Request Data:", JSON.stringify(request.data));

    const { studentUid, email, name, daysLeft, documentName, uploadLink, customHtml } = request.data;

    if (!studentUid || !email) {
        console.error("[sendOpportunityEmail] Execution failed: Missing UID or Email");
        throw new HttpsError("invalid-argument", "Missing UID or Email");
    }

    const emailBodyTxt = customHtml
        ? `${customHtml}\n\nPlease upload your documents here: ${uploadLink}`
        : `Hi ${name},\n\nYou have ${daysLeft} days left to provide your [${documentName}]. Please upload here: ${uploadLink}`;

    const emailBodyHtml = customHtml
        ? `<p>${customHtml.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p><br><br><p><a href="${uploadLink}" style="display:inline-block;padding:12px 24px;background-color:#0176d3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-family:sans-serif;">Secure Document Upload Link</a></p>`
        : `<p>Hi ${name},</p><p>You have <strong>${daysLeft} days</strong> left to provide your <strong>[${documentName}]</strong>.</p><p><a href="${uploadLink}" style="display:inline-block;padding:12px 24px;background-color:#0176d3;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-family:sans-serif;">Secure Document Upload Link</a></p>`;

    try {
        console.log(`[sendOpportunityEmail] Appending Sent stat to Firestore for ${studentUid}`);
        await db.collection("students").doc(studentUid).set({
            stats: {
                emailsSent: admin.firestore.FieldValue.increment(1),
                lastSentAt: admin.firestore.FieldValue.serverTimestamp()
            },
            communications: admin.firestore.FieldValue.arrayUnion({
                type: 'Email',
                status: 'Sent',
                timestamp: new Date().toISOString(),
                body: emailBodyTxt,
                agentName: 'System Triggered'
            })
        }, { merge: true });
        console.log(`[sendOpportunityEmail] Successfully updated local stats for ${studentUid}`);
    } catch (e) {
        console.error("[sendOpportunityEmail] Failed to append sent tracking against Uid", e);
    }

    const msg = {
        to: email,
        from: "jgarland@richmondapps.com", // Should be verified in your SendGrid Account
        subject: "Urgent: Missing R2C Documents Required",
        text: emailBodyTxt,
        html: emailBodyHtml,
        // CRITICAL for Webhooks: We append internal IDs to be returned to us later
        custom_args: {
            student_uid: studentUid,
            campaign: "r2c_missing_docs",
            sent_at_ms: Date.now().toString()
        },
    };

    try {
        console.log("[sendOpportunityEmail] Dispactching Payload to SendGrid...");
        const response = await sgMail.send(msg);
        console.log("[sendOpportunityEmail] SendGrid API Response:", response);
        return { success: true };
    } catch (error) {
        console.error("[sendOpportunityEmail] Error sending exact email via SendGrid", error);
        throw new HttpsError("internal", "SendGrid failed.");
    }
});

/**
 * Cloud Function to trigger SMS out to the Opportunity via Twilio.
 */
export const sendOpportunitySms = onCall({ secrets: [twilioSid, twilioToken, twilioPhone] }, async (request) => {
    console.log("[sendOpportunitySms] Cloud Function Invoked.");

    // Initialize Twilio using the mounted secrets
    const client = twilio(twilioSid.value(), twilioToken.value());
    const fromPhone = twilioPhone.value();

    const { studentUid, phone, name, daysLeft, documentName, uploadLink, customText } = request.data;
    if (!studentUid || !phone) {
        console.error("[sendOpportunitySms] Execution failed: Missing UID or Phone");
        throw new HttpsError("invalid-argument", "Missing UID or Phone");
    }

    // Twilio expects phone numbers in E.164 format (e.g. +17025559988). Strip dashes/spaces.
    const formattedPhone = phone.replace(/[^\d+]/g, '');
    const smsBodyTxt = customText
        ? `${customText}\n\nUpload securely here: ${uploadLink}`
        : `Hi ${name}, you have ${daysLeft} days left to provide your [${documentName}]. Please upload securely here: ${uploadLink}`;

    try {
        console.log(`[sendOpportunitySms] Sending Twilio SMS to ${formattedPhone} for ${name} (${studentUid}).`);

        // Dispatch to Twilio
        const message = await client.messages.create({
            body: smsBodyTxt,
            from: fromPhone,
            to: formattedPhone,
            // Twilio allows passing custom data through the webhook endpoint URL using query parameters:
            statusCallback: `https://us-central1-algoworks-dev.cloudfunctions.net/twilioWebhook?studentUid=${studentUid}`
        });

        console.log(`[sendOpportunitySms] Twilio Message SID: ${message.sid}`);

        // Update local tracking
        await db.collection("students").doc(studentUid).set({
            stats: {
                smsSent: admin.firestore.FieldValue.increment(1),
                lastSmsSentAt: admin.firestore.FieldValue.serverTimestamp()
            },
            communications: admin.firestore.FieldValue.arrayUnion({
                type: 'SMS',
                status: 'Sent',
                timestamp: new Date().toISOString(),
                body: smsBodyTxt,
                agentName: 'System Triggered'
            })
        }, { merge: true });

        return { success: true, messageSid: message.sid };
    } catch (e: any) {
        console.error("[sendOpportunitySms] Twilio execution failed:", e);
        if (e.code) {
            console.error(`Twilio Error Code: ${e.code}`);
        }
        if (e.message) {
            console.error(`Twilio Error Message: ${e.message}`);
        }
        throw new HttpsError("internal", `Twilio SMS failed: ${e.message || 'Unknown error'}`);
    }
});

/**
 * Twilio Webhook HTTP Endpoint to track SMS Delivery Statuses.
 * Expected URL: https://us-central1-algoworks-dev.cloudfunctions.net/twilioWebhook
 */
export const twilioWebhook = onRequest(async (req: any, res: any) => {
    console.log("[twilioWebhook] Twilio Status Webhook Fired!");

    // Twilio sends data as x-www-form-urlencoded by default or in the body
    const MessageStatus = req.body.MessageStatus || req.query.MessageStatus;
    const MessageSid = req.body.MessageSid || req.query.MessageSid;
    const ErrorCode = req.body.ErrorCode || req.query.ErrorCode;

    const studentUid = req.query.studentUid;

    console.log(`[twilioWebhook] Event: ${MessageStatus} for SID: ${MessageSid}, UID: ${studentUid}, ErrorCode: ${ErrorCode || 'None'}`);

    if (!studentUid || !MessageStatus) {
        console.warn("[twilioWebhook] Ignored payload missing targeted custom student UID or Status.");
        res.status(200).send("Ignored");
        return;
    }

    const studentRef = db.collection("students").doc(studentUid);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    if (MessageStatus === "delivered") {
        await studentRef.set({
            stats: {
                lastSmsDeliveredAt: timestamp
            },
            communications: admin.firestore.FieldValue.arrayUnion({
                type: 'SMS',
                status: 'Delivered',
                timestamp: new Date().toISOString(),
                body: `Twilio delivery status update: ${MessageStatus}`,
                agentName: 'System Triggered'
            })
        }, { merge: true });
        console.log(`[twilioWebhook] Documented successful SMS Delivery for UID: ${studentUid}`);
    } else if (MessageStatus === "failed" || MessageStatus === "undelivered") {
        console.error(`[twilioWebhook] SMS Failed/Undelivered for UID: ${studentUid}. Consider marking phone number invalid.`);
        await studentRef.set({
            communications: admin.firestore.FieldValue.arrayUnion({
                type: 'SMS',
                status: 'Failed',
                timestamp: new Date().toISOString(),
                body: `Twilio delivery failure: ${ErrorCode || 'Unknown error'}`,
                agentName: 'System Triggered'
            })
        }, { merge: true });
    }

    res.status(200).send("Processed");
});



/**
 * SendGrid Event Webhook HTTP Endpoint
 * Expected URL: https://us-central1-algoworks-dev.cloudfunctions.net/sendgridWebhook
 * You provide this URL to SendGrid in their Webhook Settings.
 */
export const sendgridWebhook = onRequest(async (req: any, res: any) => {
    console.log("[sendgridWebhook] Webhook Fired!");

    // SendGrid POSTs an array of events
    const events = req.body;
    console.log("[sendgridWebhook] Events Payload:", JSON.stringify(events));

    if (!events || !Array.isArray(events)) {
        console.error("[sendgridWebhook] Invalid Payload format received.");
        res.status(400).send("Invalid payload");
        return;
    }

    const batch = db.batch();
    let processedCount = 0;

    for (const event of events) {
        // We strictly look for events that contain our custom argument payload
        const studentUid = event.student_uid;
        if (!studentUid) continue; // Not an R2C system email

        // We can query the student doc dynamically since they are structured by UID
        // Note: Our DB has doc IDs matching UIDs (e.g. R1OsGellerUID12345678901234)
        const studentRef = db.collection("students").doc(studentUid);

        const timestamp = admin.firestore.FieldValue.serverTimestamp();

        if (event.event === "delivered") {
            console.log(`[sendgridWebhook] Found 'Delivered' event for UID: ${studentUid}`);
            processedCount++;
            batch.set(studentRef, {
                stats: { lastDeliveredAt: timestamp },
                communications: admin.firestore.FieldValue.arrayUnion({
                    type: 'Email',
                    status: 'Delivered',
                    timestamp: new Date().toISOString(),
                    body: 'Email successfully delivered.',
                    agentName: 'System Webhook'
                })
            }, { merge: true });
        }

        if (event.event === "open") {
            console.log(`[sendgridWebhook] Found 'Open' event for UID: ${studentUid}`);
            processedCount++;
            // Calculate delay based on standard epoch difference
            const sentMs = parseInt(event.sent_at_ms || '0', 10);
            const openMs = (event.timestamp * 1000) || Date.now();
            const openDelayMinutes = sentMs > 0 ? Math.round((openMs - sentMs) / 60000) : null;

            batch.set(studentRef, {
                stats: {
                    emailOpens: admin.firestore.FieldValue.increment(1),
                    lastOpenedAt: timestamp,
                    avgOpenDelayMinutes: openDelayMinutes // You could calculate a running average here
                },
                communications: admin.firestore.FieldValue.arrayUnion({
                    type: 'Email',
                    status: 'Opened',
                    timestamp: new Date().toISOString(),
                    body: 'Email opened by recipient.',
                    agentName: 'System Webhook'
                })
            }, { merge: true });
        }

        if (event.event === "click") {
            console.log(`[sendgridWebhook] Found 'Click' event for UID: ${studentUid}`);
            processedCount++;
            batch.set(studentRef, {
                stats: {
                    emailClicks: admin.firestore.FieldValue.increment(1),
                    lastClickedAt: timestamp
                },
                communications: admin.firestore.FieldValue.arrayUnion({
                    type: 'Email',
                    status: 'Clicked',
                    timestamp: new Date().toISOString(),
                    body: 'Link clicked inside email.',
                    agentName: 'System Webhook'
                })
            }, { merge: true });
        }
    }

    try {
        if (processedCount > 0) {
            console.log(`[sendgridWebhook] Committing ${processedCount} valid events to Firestore Batch...`);
            await batch.commit();
            console.log("[sendgridWebhook] Firestore Batch Committed Successfully.");
        } else {
            console.log("[sendgridWebhook] No valid R2C system events found in payload to commit.");
        }
        res.status(200).send("Processed");
    } catch (err) {
        console.error("[sendgridWebhook] Firestore batch update failed", err);
        res.status(500).send("Internal Server Error");
    }
});

/**
 * Cloud Function to generate Next Best Action insights via Vertex AI gemini-3.1-pro-preview
 */
export const generateStudentInsights = onCall(async (request) => {
    const { studentUid, dataContext } = request.data;
    if (!studentUid) {
        throw new HttpsError("invalid-argument", "Missing student UID");
    }

    try {
        console.log(`[generateStudentInsights] Invoking Vertex AI Gemini 3.1 Pro Preview for UID: ${studentUid}`);

        // Ensure proper credentials and execution context are passed
        const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT || 'algoworks-dev', location: 'us-central1' });
        // Using the gemini-2.5-flash model
        const model = 'gemini-2.5-flash';

        const generativeModel = vertex_ai.preview.getGenerativeModel({
            model: model,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.2, // Keep responses highly factual and deterministic
                responseMimeType: "application/json"
            }
        });

        const agentTrace: any[] = [];

        // ----------------------------------------------------------------------------------
        // AGENT ORCHESTRATION: Step 1 - Query the specialized Python Data Retrieval Agent
        // ----------------------------------------------------------------------------------
        console.log(`[generateStudentInsights] Waking up Python Data Agent on Cloud Run...`);
        let externalRules = {};
        const step1Start = Date.now();
        try {
            const checklistComplete = dataContext.checklist && dataContext.checklist.length > 0 && dataContext.checklist.every((i: any) => i.status === 'Completed');

            const agentResponse = await fetch('https://python-data-agent-668256868217.us-central1.run.app/query-engagement-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentUid: studentUid,
                    isChecklistComplete: checklistComplete
                })
            });
            externalRules = await agentResponse.json();
            const step1End = Date.now();
            agentTrace.push({
                agentName: 'BigQuery Data Agent',
                action: 'Retrieve Rules',
                status: 'Success',
                duration: `${step1End - step1Start}ms`,
                timestamp: new Date().toISOString()
            });
            console.log(`[generateStudentInsights] Python Data Agent returned context:`, externalRules);
            if ((externalRules as any).billing) {
                console.info(`[TOKEN_METRICS] Feature: BigQuery Data Retrieval | Bytes Billed: ${(externalRules as any).billing.totalBytesBilled} bytes | Total Exec Cost: $${(externalRules as any).billing.estimatedCostUSD.toFixed(10)}`);
            }
        } catch (e) {
            const step1End = Date.now();
            agentTrace.push({
                agentName: 'BigQuery Data Agent',
                action: 'Retrieve Rules',
                status: 'Failed',
                duration: `${step1End - step1Start}ms`,
                timestamp: new Date().toISOString()
            });
            console.error(`[generateStudentInsights] Python Data Agent Failed, proceeding with default synthesis.`, e);
        }

        // ----------------------------------------------------------------------------------
        // AGENT ORCHESTRATION: Step 2 - Pass raw data + Python rules to Synthesis Agent
        // ----------------------------------------------------------------------------------
        const prompt = `
          You are an expert academic advisor AI acting as an assistant FOR THE ENROLLMENT SPECIALIST (ES). 
          Given the following raw student data context, generate a personalized plan and outreach drafts.
          CRITICAL INSTRUCTION 1: You are an assistant talking to the ES. Therefore, in the 'overview' and 'nextBestActions' sections, you must NEVER address the student directly. Identify tasks the ES needs to perform (e.g. "Remind Peter to register").
          CRITICAL INSTRUCTION 2: The 'emailDraft' and 'smsDraft' sections are exact templates the ES will send TO THE STUDENT. Therefore, those specific drafts MUST address the student directly using "you" and "your".
          CRITICAL INSTRUCTION 3: ENGAGEMENT CAMPAIGN. Review the student's checklist. IF the student has explicitly completed 100% of their checklist items with NO missing requirements, DO NOT invent fake missing tasks. You must pivot your entire strategy to keeping them engaged before their start date. In this scenario, recommend activities like "Set up a Student Grammarly Account", "Explore Library Resources", or "Review New Student Orientation materials". Validate their success and build excitement.
          CRITICAL INSTRUCTION 4: SENTIMENT & RELEVANCY ANALYSIS. Analyze the 'notes' array. Prioritize the MOST CHRONOLOGICALLY RECENT note (e.g., within the last 7-30 days) to avoid using outdated context. You MUST perform strict sentiment analysis. If a recent note contains sensitive, negative, medical, or serious life events (e.g., surgery, illness, death, funerals), you MUST adjust your tone to be highly empathetic, compassionate, and professional. NEVER use an overly cheerful or excited tone (e.g., "I hope you had fun at...") for serious events. Acknowledge their situation appropriately (e.g., "I hope your recovery is going smoothly" or "I wanted to check in and see how you are feeling").
          CRITICAL INSTRUCTION 5: COMMUNICATION HISTORY. Review the student's 'communications' array (if any). Ensure your Next Best Actions reflect what has already been sent recently (SMS, emails, calls) to avoid redundant or tone-deaf messaging.
          
          Reply ONLY in strictly valid JSON formatted exactly like this:
          {
            "overview": {
                "intro": "Narrative intro summarizing their status in 1-2 accurate sentences based on data. Address the Enrollment Specialist directly in third-person regarding the student (e.g. 'Peter\\'s enrollment is missing...').",
                "highlight": "A 2-4 word urgently missing item (e.g., 'Missing transcript').",
                "outro": "A 1 sentence firm conclusion on immediate next steps required by the ES."
            },
            "riskSignals": {
                "timeSinceReserve": "Formatted string, e.g., '14 Days'",
                "timeUntilClassStart": "Formatted string, e.g., '30 Days' or 'Past Due'",
                "engagementLevel": "Engagement level based on data (e.g., 'High', 'Medium', 'Low').",
                "checklistProgress": "Calculated percentage string e.g., '50% Complete'",
                "riskIndicator": "Rule-based risk or urgency indicator (e.g., 'High Risk', 'On Track')"
            },
            "nextBestActions": [
                {
                    "title": "Action title explicitly commanding the ES (e.g., 'Remind student to register', NEVER 'Register for your courses').",
                    "urgent": true,
                    "points": ["Instructions for the ES, NOT the student. NEVER say 'you' or 'your'. e.g., 'Send enrollment link', NOT 'Secure your spot'."],
                    "buttonText": "Complete Task >"
                }
            ],
            "emailDraft": {
                "bodyText": "At least 3 distinct paragraphs of friendly, customized body text. DO NOT include any greeting or salutation (e.g. no 'Hi Student'). Start directly with the first sentence. CRITICAL: This email is written DIRECTLY TO THE STUDENT. You MUST address the student directly as 'you'. Review the student's 'notes' array. Use the MOST RECENT note to build extreme rapport in the first paragraph as an ice-breaker. Apply CRITICAL INSTRUCTION 4 to ensure appropriate sentiment (e.g., 'I hope you had a fantastic time at your sister's wedding!' vs 'I hope you are recovering well from your surgery.'). In the second paragraph, transition to what they need to do without dummy placeholder text. Format paragraphs using explicit '\\n\\n' strings for line breaks.",
                "bullets": ["Specific actionable task 1", "Specific actionable task 2"]
            },
            "smsDraft": "Short, friendly text STRICTLY addressed directly TO THE STUDENT (e.g., 'Hi Peter, you have...'). Under 140 chars with a clear call to action. Use note context if appropriate."
          }

          STUDENT DATA (FIRESTORE REAL-TIME STATE):
          ${JSON.stringify(dataContext)}
          
          BIGQUERY DATA WAREHOUSE (HISTORICAL RECORDS & ENGAGEMENT RULES):
          ${JSON.stringify(externalRules)}
        `;

        const reqPayload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };

        const step2Start = Date.now();
        const resp = await generativeModel.generateContent(reqPayload);
        const step2End = Date.now();

        agentTrace.push({
            agentName: 'Synthesis & Communication Agent',
            action: 'Generate Profile & Drafts',
            status: 'Success',
            duration: `${step2End - step2Start}ms`,
            timestamp: new Date().toISOString()
        });

        const responseText = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        // --- Custom Token Reporting for CIO Demo ---
        const usage = resp.response.usageMetadata;
        if (usage) {
            const inTokens = usage.promptTokenCount || 0;
            const outTokens = usage.candidatesTokenCount || 0;

            // Exact Math for Gemini 2.5 Flash Pricing
            const inCost = (inTokens / 1000000) * 0.30;
            const outCost = (outTokens / 1000000) * 2.50;
            const totalCost = inCost + outCost;

            console.info(`[TOKEN_METRICS] Feature: AI Profile Generation | Input: ${inTokens} tokens ($${inCost.toFixed(6)}) | Output: ${outTokens} tokens ($${outCost.toFixed(6)}) | Total Exec Cost: $${totalCost.toFixed(7)}`);
        }

        const aiPayload = JSON.parse(responseText);
        // Inject the orchestration trace
        aiPayload.agentTrace = agentTrace;

        console.log(`[generateStudentInsights] Valid JSON successfully generated.`);

        // Append generated AI payload directly to the student record in Firestore
        await db.collection("students").doc(studentUid).set({
            aiInsights: aiPayload
        }, { merge: true });

        return { success: true, aiInsights: aiPayload };
    } catch (e: any) {
        console.error("[generateStudentInsights] Vertex AI Generation Failed", e);
        throw new HttpsError("internal", `Vertex AI failed: ${e.message}`);
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
        throw new HttpsError("invalid-argument", "Missing uid, fileName, or query");
    }

    try {
        console.log(`[queryStudentDocument] Initiating Gemini File Parse for: ${fileName}`);
        const filePath = `uploads/${studentUid}/${fileName}`;
        const bucket = admin.storage().bucket();
        const [metadata] = await bucket.file(filePath).getMetadata();
        const mimeType = metadata.contentType || 'application/pdf';

        // Native mapping to Vertex AI without requiring secondary Vector DB or local copies
        const fileUri = `gs://${bucket.name}/${filePath}`;

        const vertex_ai = new VertexAI({ project: process.env.GCLOUD_PROJECT || 'algoworks-dev', location: 'us-central1' });
        const model = 'gemini-2.5-flash';

        const generativeModel = vertex_ai.preview.getGenerativeModel({
            model: model,
            generationConfig: {
                maxOutputTokens: 2048,
                temperature: 0.2
            }
        });

        // Pack the multimodal prompt with the direct GS URI and the user's natural language question
        const reqPayload = {
            contents: [{
                role: 'user',
                parts: [
                    { fileData: { fileUri, mimeType } },
                    { text: `You are an expert financial aid and academic document reviewer. Read the attached file and explicitly answer the following question or perform the summary requested. \n\nQuery: "${query}"\n\nOnly return the plain text answer.` }
                ]
            }]
        };

        const resp = await generativeModel.generateContent(reqPayload);
        const responseText = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";

        // --- Custom Token Reporting for CIO Demo ---
        const usage = resp.response.usageMetadata;
        if (usage) {
            const inTokens = usage.promptTokenCount || 0;
            const outTokens = usage.candidatesTokenCount || 0;

            // Exact Math for Gemini 2.5 Flash Pricing
            const inCost = (inTokens / 1000000) * 0.30;
            const outCost = (outTokens / 1000000) * 2.50;
            const totalCost = inCost + outCost;

            console.info(`[TOKEN_METRICS] Feature: Document Scanning | Input: ${inTokens} tokens ($${inCost.toFixed(6)}) | Output: ${outTokens} tokens ($${outCost.toFixed(6)}) | Total Exec Cost: $${totalCost.toFixed(7)}`);
        }

        return { success: true, answer: responseText.trim() };
    } catch (e: any) {
        console.error("[queryStudentDocument] Vertex AI Document Parsing Failed", e);
        throw new HttpsError("internal", `Vertex AI Parsing Error: ${e.message}`);
    }
});
