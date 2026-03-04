"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryStudentDocument = exports.generateStudentInsights = exports.sendgridWebhook = exports.twilioWebhook = exports.sendOpportunitySms = exports.sendOpportunityEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const https_2 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const sgMail = require("@sendgrid/mail");
const twilio = require("twilio");
const vertexai_1 = require("@google-cloud/vertexai");
// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
// Define the secret that was configured in GCP Secret Manager
const sendgridApiKey = (0, params_1.defineSecret)("SENDGRID_API_KEY");
const twilioSid = (0, params_1.defineSecret)("TWILIO_ACCOUNT_SID");
const twilioToken = (0, params_1.defineSecret)("TWILIO_AUTH_TOKEN");
const twilioPhone = (0, params_1.defineSecret)("TWILIO_PHONE_NUMBER");
/**
 * Cloud Function to trigger an HTML Email out to the Opportunity via SendGrid.
 * It passes the specific Student UID securely into SendGrid's custom_args payload.
 */
exports.sendOpportunityEmail = (0, https_1.onCall)({ secrets: [sendgridApiKey] }, async (request) => {
    // Now we initialize SendGrid directly inside the function where the secret has properly mounted
    sgMail.setApiKey(sendgridApiKey.value());
    console.log("[sendOpportunityEmail] Cloud Function Invoked.");
    console.log("[sendOpportunityEmail] Request Data:", JSON.stringify(request.data));
    const { studentUid, email, name, daysLeft, documentName, uploadLink, customHtml } = request.data;
    if (!studentUid || !email) {
        console.error("[sendOpportunityEmail] Execution failed: Missing UID or Email");
        throw new https_1.HttpsError("invalid-argument", "Missing UID or Email");
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
    }
    catch (e) {
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
    }
    catch (error) {
        console.error("[sendOpportunityEmail] Error sending exact email via SendGrid", error);
        throw new https_1.HttpsError("internal", "SendGrid failed.");
    }
});
/**
 * Cloud Function to trigger SMS out to the Opportunity via Twilio.
 */
exports.sendOpportunitySms = (0, https_1.onCall)({ secrets: [twilioSid, twilioToken, twilioPhone] }, async (request) => {
    console.log("[sendOpportunitySms] Cloud Function Invoked.");
    // Initialize Twilio using the mounted secrets
    const client = twilio(twilioSid.value(), twilioToken.value());
    const fromPhone = twilioPhone.value();
    const { studentUid, phone, name, daysLeft, documentName, uploadLink, customText } = request.data;
    if (!studentUid || !phone) {
        console.error("[sendOpportunitySms] Execution failed: Missing UID or Phone");
        throw new https_1.HttpsError("invalid-argument", "Missing UID or Phone");
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
    }
    catch (e) {
        console.error("[sendOpportunitySms] Twilio execution failed:", e);
        if (e.code) {
            console.error(`Twilio Error Code: ${e.code}`);
        }
        if (e.message) {
            console.error(`Twilio Error Message: ${e.message}`);
        }
        throw new https_1.HttpsError("internal", `Twilio SMS failed: ${e.message || 'Unknown error'}`);
    }
});
/**
 * Twilio Webhook HTTP Endpoint to track SMS Delivery Statuses.
 * Expected URL: https://us-central1-algoworks-dev.cloudfunctions.net/twilioWebhook
 */
exports.twilioWebhook = (0, https_2.onRequest)(async (req, res) => {
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
    }
    else if (MessageStatus === "failed" || MessageStatus === "undelivered") {
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
exports.sendgridWebhook = (0, https_2.onRequest)(async (req, res) => {
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
        if (!studentUid)
            continue; // Not an R2C system email
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
        }
        else {
            console.log("[sendgridWebhook] No valid R2C system events found in payload to commit.");
        }
        res.status(200).send("Processed");
    }
    catch (err) {
        console.error("[sendgridWebhook] Firestore batch update failed", err);
        res.status(500).send("Internal Server Error");
    }
});
/**
 * Cloud Function to generate Next Best Action insights via Vertex AI gemini-3.1-pro-preview
 */
exports.generateStudentInsights = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const { studentUid, dataContext } = request.data;
    if (!studentUid) {
        throw new https_1.HttpsError("invalid-argument", "Missing student UID");
    }
    try {
        console.log(`[generateStudentInsights] Invoking Vertex AI Gemini 3.1 Pro Preview for UID: ${studentUid}`);
        // Ensure proper credentials and execution context are passed
        const vertex_ai = new vertexai_1.VertexAI({ project: process.env.GCLOUD_PROJECT || 'algoworks-dev', location: 'us-central1' });
        // Using the highly capable gemini-2.5-flash model as requested
        const model = 'gemini-2.5-flash';
        const generativeModel = vertex_ai.preview.getGenerativeModel({
            model: model,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.2, // Keep responses highly factual and deterministic
                responseMimeType: "application/json"
            }
        });
        const prompt = `
          You are an expert academic advisor AI acting as an assistant FOR THE ENROLLMENT SPECIALIST (ES). 
          Given the following raw student data context, generate a personalized plan and outreach drafts.
          CRITICAL INSTRUCTION: You are talking to the ES. You must NEVER address the student directly in the 'overview' or 'nextBestActions' sections. NEVER use words like "Your", "You", or "Register for your courses". Identify tasks the ES needs to perform (e.g. "Remind student to register").
          
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
                "bodyText": "1-2 paragraphs of friendly, customized body text explaining what they need to do without dummy placeholder text. DO NOT include any greeting or salutation (e.g. no 'Hi Student'). Start directly with the first sentence.",
                "bullets": ["Specific actionable task 1", "Specific actionable task 2"]
            },
            "smsDraft": "Short, friendly text strictly under 140 chars with a clear call to action."
          }

          STUDENT DATA:
          ${JSON.stringify(dataContext)}
        `;
        const reqPayload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        };
        const resp = await generativeModel.generateContent(reqPayload);
        const responseText = ((_e = (_d = (_c = (_b = (_a = resp.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || "{}";
        const aiPayload = JSON.parse(responseText);
        console.log(`[generateStudentInsights] Valid JSON successfully generated.`);
        // Append generated AI payload directly to the student record in Firestore
        await db.collection("students").doc(studentUid).set({
            aiInsights: aiPayload
        }, { merge: true });
        return { success: true, aiInsights: aiPayload };
    }
    catch (e) {
        console.error("[generateStudentInsights] Vertex AI Generation Failed", e);
        throw new https_1.HttpsError("internal", `Vertex AI failed: ${e.message}`);
    }
});
/**
 * Cloud Function to directly query or summarize an uploaded student document on demand.
 * This dynamically utilizes Gemini's native File API integrations simply by translating
 * the existing Firebase Storage mapping into a vector-ready GS:// URI.
 */
exports.queryStudentDocument = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d, _e;
    const { studentUid, fileName, query } = request.data;
    if (!studentUid || !fileName || !query) {
        throw new https_1.HttpsError("invalid-argument", "Missing uid, fileName, or query");
    }
    try {
        console.log(`[queryStudentDocument] Initiating Gemini File Parse for: ${fileName}`);
        const filePath = `uploads/${studentUid}/${fileName}`;
        const bucket = admin.storage().bucket();
        const [metadata] = await bucket.file(filePath).getMetadata();
        const mimeType = metadata.contentType || 'application/pdf';
        // Native mapping to Vertex AI without requiring secondary Vector DB or local copies
        const fileUri = `gs://${bucket.name}/${filePath}`;
        const vertex_ai = new vertexai_1.VertexAI({ project: process.env.GCLOUD_PROJECT || 'algoworks-dev', location: 'us-central1' });
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
        const responseText = ((_e = (_d = (_c = (_b = (_a = resp.response.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.text) || "No response generated.";
        return { success: true, answer: responseText.trim() };
    }
    catch (e) {
        console.error("[queryStudentDocument] Vertex AI Document Parsing Failed", e);
        throw new https_1.HttpsError("internal", `Vertex AI Parsing Error: ${e.message}`);
    }
});
//# sourceMappingURL=index.js.map