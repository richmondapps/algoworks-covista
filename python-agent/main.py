import os
import json
import threading
import vertexai
import re
import datetime
from vertexai.preview.generative_models import GenerativeModel
from flask import Flask, request, jsonify
from google.cloud import bigquery, firestore

app = Flask(__name__)

project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "algoworks-dev")
dataset_id = "covista_demo"
table_id = "engagement_rules"

bq_client = bigquery.Client(project=project_id)
db = firestore.Client(project=project_id)

vertexai.init(project=project_id, location="us-central1")
model_name = "gemini-2.5-flash"

def generate_core_insights(data_context):
    model = GenerativeModel(model_name)
    prompt = f"""
    You are an expert academic advisor AI (Student Success Agent).
    CRITICAL INSTRUCTION 1: You are an assistant talking to the ES. Therefore, in the 'overview' and 'nextBestActions' sections, you must NEVER address the student directly.
    CRITICAL INSTRUCTION 3: Review the student's checklist. IF they completed 100%, DO NOT invent missing tasks. Pivot to keeping them engaged.
    
    Reply ONLY in strictly valid JSON formatted exactly like this:
    {{
      "overview": {{
          "intro": "Narrative intro summarizing status in 1-2 short sentences.",
          "highlight": "A 2-4 word urgently missing item.",
          "outro": "A 1 short sentence firm conclusion."
      }},
      "riskSignals": {{
          "timeSinceReserve": "Formatted string",
          "timeUntilClassStart": "Formatted string",
          "engagementLevel": "High, Medium, Low",
          "checklistProgress": "Calculated percentage string e.g., '50% Complete'",
          "riskIndicator": "High Risk, On Track"
      }},
      "nextBestActions": [
          {{
              "title": "Action title explicitly commanding the ES",
              "urgent": true,
              "points": ["Instructions for the ES, NOT the student."],
              "buttonText": "Review Requirement"
          }}
      ]
    }}

    CRITICAL INSTRUCTION: For 'buttonText', DO NOT use words like "Send Email" or "Email Student". Set it EXACTLY to "Review Requirement" or "Complete Task >".

    STUDENT DATA:
    {json.dumps(data_context)}
    """
    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json", "temperature": 0.2}
    )
    try:
        raw_text = response.text.replace('```json', '').replace('```', '')
        return json.loads(raw_text.strip())
    except:
        print("[Core Insights] FAILED TO PARSE:", response.text)
        return {}

def generate_communications(data_context):
    model = GenerativeModel(model_name)
    prompt = f"""
    You are an expert academic advisor AI (Communications Agent). Given the raw student data context, generate personalized outreach drafts TO THE STUDENT.
    CRITICAL: Ensure your drafts reflect recent 'notes' sentiment (e.g., extremely empathetic if health/death, excited if normal).
    
    Reply ONLY in strictly valid JSON formatted exactly like this:
    {{
      "emailDraft": {{
          "bodyText": "A friendly, customized 2 paragraph body text. DO NOT include any greeting or salutation.",
          "bullets": ["Specific actionable task 1"]
      }},
      "smsDraft": "Short, friendly text STRICTLY addressed directly TO THE STUDENT. Under 140 chars."
    }}

    STUDENT DATA:
    {json.dumps(data_context)}
    """
    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json", "temperature": 0.2}
    )
    try:
        raw_text = response.text.replace('```json', '').replace('```', '')
        return json.loads(raw_text.strip())
    except:
        print("[Comms Agent] FAILED TO PARSE:", response.text)
        return {}

@app.route('/generate-insights', methods=['POST'])
def generate_insights():
    req_data = request.json
    student_uid = req_data.get('studentUid')
    data_context = req_data.get('dataContext', {})
    
    # -------------------------------------------------------------
    # PHASE 1: Immediate Synchronous Execution for Core UI Matrix
    # -------------------------------------------------------------
    core_payload = generate_core_insights(data_context)
    
    # Inject generation timestamp for UI freshness tracking
    core_payload["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    # -------------------------------------------------------------
    # PHASE 2: Detached Background Execution for Heavy Comms payload
    # -------------------------------------------------------------
    def generate_and_save_comms(uid, context):
        comms_payload = generate_communications(context)
        print(f"[Comms Agent] Background Generation Complete for UID: {uid}. Merging into Firestore.")
        if uid and comms_payload:
            # Safely overlay ONLY the specific Comms vectors using dot-notation string maps!
            print(f"[Comms Agent] Successfully captured valid Comms payload! Injecting to database...")
            try:
                db.collection('salesforce_opportunities').document(uid).update({
                    "aiInsights.emailDraft": comms_payload.get("emailDraft"),
                    "aiInsights.smsDraft": comms_payload.get("smsDraft")
                })
            except Exception as er:
                print(f"[Comms Agent] FAILED TO INJECT COMMS INTO FIRESTORE: {er}")

    # Spawning the background worker
    threading.Thread(target=generate_and_save_comms, args=(student_uid, data_context)).start()
    
    # Immediately return the Phase 1 trace to unblock the Enrollment Specialist's UI
    core_payload["agentTrace"] = [
        {
            "agentName": "Student Success Agent",
            "action": "Generate Core Risk Profile",
            "status": "Success",
            "duration": "Python Local Thread",
            "timestamp": "Now"
        },
        {
            "agentName": "Communications Agent",
            "action": "Synthesize Custom Outreach (Detached)",
            "status": "Processing in Background...",
            "duration": "Awaiting Callback",
            "timestamp": "Now"
        }
    ]
    
    return jsonify(core_payload)

# ------------------------------------------------------------------
# Phase 1: Operational Ingestion Bridge (BigQuery -> Firestore)
# ------------------------------------------------------------------
@app.route('/sync-bq-to-firestore', methods=['POST'])
def sync_bq_to_firestore():
    print("[Ingestion Bridge] Starting Comprehensive BigQuery to Firestore sync...")
    
    # 1. Fetch Student Courses and group by Student ID
    course_query = f"SELECT student_id, course_id, is_accredited, course_registration_status, first_login_at, first_discussion_post_at FROM `{project_id}.{dataset_id}.student_courses`"
    course_rows = bq_client.query(course_query).result()
    course_map = {}
    for row in course_rows:
        student_id = str(row.student_id)
        if student_id not in course_map:
            course_map[student_id] = []
        course_map[student_id].append({
            "courseId": row.course_id,
            "isAccredited": row.is_accredited,
            "registrationStatus": row.course_registration_status,
            "firstLoginAt": row.first_login_at.isoformat() if row.first_login_at else None,
            "firstDiscussionPostAt": row.first_discussion_post_at.isoformat() if row.first_discussion_post_at else None
        })

    # 2. Fetch Student Contingencies and group by Student ID
    cont_query = f"SELECT student_id, contingency_id, institution_name, contingency_type, contingency_status FROM `{project_id}.{dataset_id}.student_contingencies`"
    cont_rows = bq_client.query(cont_query).result()
    cont_map = {}
    for row in cont_rows:
        student_id = str(row.student_id)
        if student_id not in cont_map:
            cont_map[student_id] = []
        cont_map[student_id].append({
            "id": row.contingency_id,
            "institutionName": row.institution_name,
            "type": row.contingency_type,
            "status": row.contingency_status
        })

    # 3. Query the unified `student_core` landing table
    core_query = f"""
        SELECT 
            student_id, full_name, institution_code, program_code, 
            program_start_date, reserve_date, trf_form_on_file, 
            enrollment_status, funding_plan_status, 
            wwow_orientation_started_at, etl_updated_at
        FROM `{project_id}.{dataset_id}.student_core`
    """
    
    try:
        query_job = bq_client.query(core_query)
        rows = query_job.result()
        
        synced_count = 0
        batch = db.batch()
        
        for row in rows:
            student_id = str(row.student_id)
            
            # Construct the exact nested Firestore JSON contract
            student_payload = {
                "id": student_id,
                "name": row.full_name,
                "program": row.program_code,
                "institution": row.institution_code,
                "status": row.enrollment_status,
                
                # Coerce Dates to ISO Strings for Angular compatibility
                "programStartDate": row.program_start_date.isoformat() if row.program_start_date else None,
                "reserveDate": row.reserve_date.isoformat() if row.reserve_date else None,
                
                "requirements": {
                    "officialTranscriptsReceived": row.trf_form_on_file,
                    "fundingPlan": True if row.funding_plan_status == "Approved" else False,
                    "orientationStarted": True if row.wwow_orientation_started_at else False,
                },
                
                # Inject mapped nested arrays
                "courseActivity": course_map.get(student_id, []),
                "contingencies": cont_map.get(student_id, []),
                
                "lastUpdatedByPipelineAt": row.etl_updated_at.isoformat() if row.etl_updated_at else None
            }
            
            doc_ref = db.collection('student_records').document(student_id)
            batch.set(doc_ref, student_payload, merge=True)
            synced_count += 1
            
            if synced_count % 500 == 0:
                batch.commit()
                batch = db.batch()
                
        if synced_count % 500 != 0:
            batch.commit()
            
        print(f"[Ingestion Bridge] Successfully synced {synced_count} fully-hydrated student records to Firestore.")
        return jsonify({"status": "Success", "records_synced": synced_count})
        
    except Exception as e:
        print("[Ingestion Bridge] Failed to sync data:", e)
        return jsonify({"status": "Failed", "error": str(e)}), 500

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "Python BigQuery Agent Online", "version": "1.5.0"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
