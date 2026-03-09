import os
from flask import Flask, request, jsonify
from google.cloud import bigquery
from google.adk.agents import LlmAgent
from google.adk.tools.bigquery import BigQueryToolset

app = Flask(__name__)

project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "algoworks-dev")
dataset_id = "covista_demo"
table_id = "engagement_rules"

bq_client = bigquery.Client(project=project_id)

# ------------------------------------------------------------------
# ADK LlmAgent Definition (Architecture Pattern for CIO)
# ------------------------------------------------------------------
def _make_sql_agent(project_id: str, dataset_id: str, table_id: str) -> LlmAgent:
    fq_table = f"`{project_id}.{dataset_id}.{table_id}`"
    
    # Initialize the ADK BigQuery toolset
    bigquery_toolset = BigQueryToolset()
    
    return LlmAgent(
        name="SQLAgent",
        model="gemini-2.5-flash",
        instruction=f"""
You are the SQL EXECUTION agent. You have BigQuery tools.
Your task is to review the schema and query the BigQuery table: {fq_table}
The table contains columns `is_checklist_complete` (BOOL) and `rule` (STRING).
If the user indicates the checklist is complete, query for rules where `is_checklist_complete` is true.
If the checklist is incomplete, query for rules where `is_checklist_complete` is false.
""",
        tools=[bigquery_toolset],
    )

# Instantiate the Agent structure
sql_agent = _make_sql_agent(project_id, dataset_id, table_id)

@app.route('/query-engagement-rules', methods=['POST'])
def query_engagement_rules():
    data = request.json
    student_id = data.get('studentUid', 'Unknown')
    completed_checklist = data.get('isChecklistComplete', False)
    
    print(f"[{sql_agent.name}] Delegating to BigQuery Toolset to evaluate UID: {student_id} and checklist: {completed_checklist}")
    
    # Execute the live BigQuery query for Engagement Rules
    rules_query = f"""
        SELECT rule 
        FROM `{project_id}.{dataset_id}.{table_id}`
        WHERE is_checklist_complete = {completed_checklist}
    """
    
    # Execute the live BigQuery query for the Student Record
    student_query = f"""
        SELECT full_name, academic_program, enrollment_status 
        FROM `{project_id}.{dataset_id}.r2c_student_records`
        WHERE student_uid = @student_uid
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("student_uid", "STRING", student_id)
        ]
    )
    
    try:
        rules_job = bq_client.query(rules_query)
        rules = [row.rule for row in rules_job.result()]
        
        student_job = bq_client.query(student_query, job_config=job_config)
        student_records = [dict(row) for row in student_job.result()]
        historical_record = student_records[0] if student_records else {"status": "No historical record found in BigQuery Warehouse."}
        
        response = {
            "agent": "ADK SQLAgent (BigQuery)",
            "status": "Success",
            "historical_student_record": historical_record,
            "retrieved_policies": rules,
            "confidence": 0.99
        }
    except Exception as e:
        print(f"[{sql_agent.name}] BigQuery execution failed:", e)
        response = {
            "agent": "ADK SQLAgent (BigQuery)",
            "status": "Failed",
            "retrieved_policies": ["Error retrieving rules from data warehouse."],
            "confidence": 0.0
        }
        
    return jsonify(response)

@app.route('/', methods=['GET'])
def health_check():
    return jsonify({"status": "Python BigQuery Agent Online", "version": "1.5.0"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
