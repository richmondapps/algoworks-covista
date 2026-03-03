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
exports.sendgridWebhook = exports.twilioWebhook = exports.sendOpportunitySms = exports.sendOpportunityEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const https_2 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const sgMail = __importStar(require("@sendgrid/mail"));
const twilio = require("twilio");
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
    const { studentUid, email, name, daysLeft, documentName, uploadLink } = request.data;
    if (!studentUid || !email) {
        console.error("[sendOpportunityEmail] Execution failed: Missing UID or Email");
        throw new https_1.HttpsError("invalid-argument", "Missing UID or Email");
    }
    try {
        console.log(`[sendOpportunityEmail] Appending Sent stat to Firestore for ${studentUid}`);
        await db.collection("students").doc(studentUid).set({
            stats: {
                emailsSent: admin.firestore.FieldValue.increment(1),
                lastSentAt: admin.firestore.FieldValue.serverTimestamp()
            }
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
        text: `Hi ${name},\n\nYou have ${daysLeft} days left to provide your [${documentName}]. Please upload here: ${uploadLink}`,
        html: `<p>Hi ${name},</p><p>You have <strong>${daysLeft} days</strong> left to provide your <strong>[${documentName}]</strong>.</p><p><a href="${uploadLink}">Secure Upload Link</a></p>`,
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
    const { studentUid, phone, name, daysLeft, documentName, uploadLink } = request.data;
    if (!studentUid || !phone) {
        console.error("[sendOpportunitySms] Execution failed: Missing UID or Phone");
        throw new https_1.HttpsError("invalid-argument", "Missing UID or Phone");
    }
    // Twilio expects phone numbers in E.164 format (e.g. +17025559988). Strip dashes/spaces.
    const formattedPhone = phone.replace(/[^\d+]/g, '');
    try {
        console.log(`[sendOpportunitySms] Sending Twilio SMS to ${formattedPhone} for ${name} (${studentUid}).`);
        // Dispatch to Twilio
        const message = await client.messages.create({
            body: `Hi ${name}, you have ${daysLeft} days left to provide your [${documentName}]. Please upload securely here: ${uploadLink}`,
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
            }
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
            }
        }, { merge: true });
        console.log(`[twilioWebhook] Documented successful SMS Delivery for UID: ${studentUid}`);
    }
    else if (MessageStatus === "failed" || MessageStatus === "undelivered") {
        console.error(`[twilioWebhook] SMS Failed/Undelivered for UID: ${studentUid}. Consider marking phone number invalid.`);
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
                stats: { lastDeliveredAt: timestamp }
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
                }
            }, { merge: true });
        }
        if (event.event === "click") {
            console.log(`[sendgridWebhook] Found 'Click' event for UID: ${studentUid}`);
            processedCount++;
            batch.set(studentRef, {
                stats: {
                    emailClicks: admin.firestore.FieldValue.increment(1),
                    lastClickedAt: timestamp
                }
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
//# sourceMappingURL=index.js.map