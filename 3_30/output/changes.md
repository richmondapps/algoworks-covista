# Covista BigQuery Data Contract - Change Log

Version: v2
Date: 2026-03-30
Based on: Team discussions and ChatGPT expert review sessions

## Changes from V1 to V2

1. Added Task History support via `communication_type` field in student_activity_log
2. Updated Contingency naming - removed hardcoded fields like transcript/nursing (now generic)
3. Clarified Accreditation logic - evaluated by App team, not DE
4. Added `funding_type` to student_core - clarifies FAFSA vs Alternative funding
5. Confirmed ingestion via Pub/Sub - no direct Firestore mapping by DE
6. Added `activity_category` field - enables clean timeline filtering (student_event | advisor_task | contingency) without app-side inference

## Why activity_category Was Added

The ChatGPT expert review identified that without this field, the app team would need to
infer row type from activity_name and communication_type combined - which is fragile.
With activity_category, any query can instantly filter advisor tasks, student events,
or contingencies in a single WHERE clause.

## Open Items (as of 2026-03-30)

- Confirm exact Salesforce field mapping to fafsa_application_received
- Confirm communication_type values with ES team (phone/email/text/chat/file_review)
- Align on Reserved vs WWOW Access Granted sequencing in activity dictionary