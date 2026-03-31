# Covista App: Firestore Data Payload Contract
**Target Collection:** `student_records`

Since we have eliminated BigQuery as the operational middle-man, the Data Engineering team is responsible for pushing the JSON documents directly into the Firestore `student_records` collection. 

Below is the strict schema contract. 

### Document ID Convention
The Firestore Document ID must explicitly match the `studentUid`.

### Active Column Mapping (Source to JSON)

The Data Engineering team should use the following explicit source columns to build the JSON payload below:

| Source Column (Spreadsheet) | JSON Payload Target | Description / Transformation |
| :--- | :--- | :--- |
| `student_id` | `id` and `studentUid` | Explicit unique identifier. |
| `student_name` | `name` | String. |
| `program_desc` | `programDesc` | String. |
| `term_desc` | `termDesc` | String. |
| `enrollment_specialist_name` | `enrollmentSpecialist` | String. |
| `program_start_date` | `programStartDate` | ISO 8601 Datetime String. |
| `reserve_date` | `reserveDate` | ISO 8601 Datetime String. |
| `census_date` | `censusDate` | ISO 8601 Datetime String. Must be passed so Angular can compute if Assignment 1 was submitted before the census limit! |

### Evaluation Rules (The Logic Nodes)
These nodes fall under the `"requirements"` JSON body. The Data Team must collapse multiple rows (since students have multiple courses/transcripts) into these flat booleans BEFORE pushing to Firestore.

| Source Column | JSON Payload Target | Rule |
| :--- | :--- | :--- |
| `fafsa_application_received` | `fafsaSubmitted` | **True** if received from student. |
| `fafsa_intend_to_fund` | `fundingPlan` | **True** if fully approved/awarded. |
| `course_registration_status` | `courseRegistration` | **True** if at least one row is 'Registered'. |
| `wwow_login` | `wwowOrientationStarted` | **True** if populated/started. |
| `transcript_status` | `officialTranscriptsReceived` | **True** ONLY if ALL required transcripts are Cleared. |
| `nursing_license` (Add this row) | `nursingLicenseReceived` | **True** if received. |

### The Course Array (Chronological Nodes)
Data Engineering should group all courses by `student_id` and push an array of objects to the `courseActivity` property.

| Source Column | JSON Payload Array Target | Rule |
| :--- | :--- | :--- |
| `course_identification` | `courseId` | String. |
| `first_login_dt` | `firstLoginAt` | ISO String (Or `null`). |
| `first_discussion_board_submission_date` | `firstDiscussionPostAt` | ISO String (Or `null`). |
| `course_last_attend_date` | `lastAttendAt` | ISO String (Or `null`). Used natively by Angular to dynamically score Engagement Levels based on recency. |
| `course_level` (Assuming) | `isAccredited` | **Extremely Important:** Convert logic (e.g. if GQ = Accredited) into a strict `true/false` constraint so UI can ignore non-accredited mock logins. |

---

### Final Validated Output Payload Schema

```json
{
  "id": "A00302996",
  "studentUid": "A00302996",
  "name": "Collins, Amy",
  "programDesc": "MS in Nursing (MSN) - BSN",
  "termDesc": "2023 Spring Qtr 02/27-05/21",
  "enrollmentSpecialist": "Karen Rabe",
  
  "programStartDate": "2023-02-27T00:00:00.000Z",
  "reserveDate": "2023-02-17T00:00:00.000Z",
  "censusDate": "2023-03-09T00:00:00.000Z",
  
  "requirements": {
    "fafsaSubmitted": false,
    "fundingPlan": false,
    "courseRegistration": true,
    "wwowOrientationStarted": true,
    "officialTranscriptsReceived": false,
    "nursingLicenseReceived": true
  },

  "courseActivity": [
    {
      "courseId": "WWOW1000M",
      "isAccredited": true,
      "firstLoginAt": "2023-02-20T13:47:41.000000Z",
      "firstDiscussionPostAt": null,
      "lastAttendAt": "2023-02-23T08:15:00.000Z"
    }
  ]
}
```

### Engineering Notes for Integration:
1. **Dynamic Real-Time Computations:** Once this payload lands natively in Firestore, the Angular Web Application evaluates `firstLoginAt` constraints strictly applying the `isAccredited` filter locally to power the UI progress pills.
2. **Missing CRM Nodes:** The spreadsheet does not track `<phone>` or `<email>`. These should optionally be merged from the CRM tables before pushing the payload if available.
3. **Firestore Merges:** Remember to deploy via Firebase `setDoc({ merge: true })` API scripts dynamically out of your data pipeline so changes update precisely.
