"""Flask application — infrastructure layer for the Covista AI agent pipeline.

Infrastructure responsibility: compose domain agents via the orchestrator,
manage I/O (Firestore, HTTP), and expose Flask endpoints consumed by the
Cloud Functions trigger and admin tooling.

Architecture layers:
    Domain (agents/): Pure business logic — no Flask, no Firestore.
    Orchestration (orchestration/): Pipeline sequencing — no Firestore.
    Infrastructure (this file): I/O, composition, and HTTP routing.
"""

from __future__ import annotations

import os
import threading
from typing import Any

import google.auth
import vertexai
from flask import Flask, Response, jsonify, request
from google.cloud import bigquery, firestore

from agents.communications_agent import CommunicationsAgent
from agents.nba_agent import NBAAgent
from agents.readiness_agent import ReadinessAgent
from agents.risk_agent import RiskAgent
from orchestration.orchestrator import AgentOrchestrator, DerivedOutput

# ---------------------------------------------------------------------------
# Project / environment configuration
# ---------------------------------------------------------------------------

app = Flask(__name__)

_, _auth_project = google.auth.default()
PROJECT_ID: str = _auth_project or os.environ.get(
    "GOOGLE_CLOUD_PROJECT", "dev-wu-agenticai-app-proj"
)
DATASET_ID: str = "covista_demo"

bq_client: bigquery.Client = bigquery.Client(project=PROJECT_ID)
db: firestore.Client = firestore.Client(project=PROJECT_ID)

vertexai.init(project=PROJECT_ID, location="us-central1")

# Production pipeline: Readiness → Risk → NBA → Communications.
# Stateless singletons — safe to share across requests.
_orchestrator: AgentOrchestrator = AgentOrchestrator(
    agents=[
        ReadinessAgent(),
        RiskAgent(),
        NBAAgent(),
        CommunicationsAgent(),
    ]
)


# ---------------------------------------------------------------------------
# AI insights endpoint
# ---------------------------------------------------------------------------

@app.route("/generate-insights", methods=["POST"])
def generate_insights() -> Response:
    """Orchestrate the four-phase AI pipeline for a single student.

    Enriches the state with recent activity logs from the Firestore
    activity_logs subcollection, then delegates all agent sequencing to
    AgentOrchestrator.  The full DerivedOutput is returned synchronously.
    Firestore persistence runs in a background thread.

    Pipeline order (managed by orchestrator):
        1. Readiness Agent  — checklist + timing evaluation.
        2. Risk Agent       — engagement risk + overview summary.
        3. NBA Agent        — Next Best Actions grounded in 1 + 2.
        4. Communications   — email/SMS drafts aligned with top NBA.

    Returns:
        JSON response matching the ai_insights/latest schema defined in
        docs/student-state-schema.json.
    """
    req_data: dict[str, Any] = request.json
    student_uid: str | None = req_data.get("studentUid")
    state: dict[str, Any] = req_data.get("dataContext", {})

    # Enrich state with recent activity logs so agents have behavioural
    # context for engagement and risk assessment.
    if student_uid:
        state = _enrich_with_activity_logs(
            student_uid=student_uid,
            state=state,
        )

    derived: DerivedOutput = _orchestrator.run(state=state)

    # Persist to Firestore without blocking the HTTP response.
    thread = threading.Thread(
        target=_persist_derived,
        args=(student_uid, derived),
    )
    thread.start()

    return jsonify(derived)


def _enrich_with_activity_logs(
    student_uid: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    """Load the last 50 activity log events and inject them into state.

    Reads from the activity_logs subcollection ordered by datetime
    descending.  Returns the original state unchanged on any Firestore
    error, so a missing subcollection never blocks the pipeline.

    Args:
        student_uid: Firestore document ID for the student.
        state: Current student state dict to enrich.

    Returns:
        Copy of state with 'recentActivityLogs' key populated, or the
        original state dict when the read fails.
    """
    try:
        logs_ref = (
            db.collection("salesforce_opportunities")
            .document(student_uid)
            .collection("activity_logs")
            .order_by(
                "activity_datetime",
                direction=firestore.Query.DESCENDING,
            )
            .limit(50)
        )
        logs: list[dict[str, Any]] = [
            doc.to_dict() for doc in logs_ref.stream()
        ]
        return {**state, "recentActivityLogs": logs}
    except Exception as exc:  # noqa: BLE001
        print(
            f"[generate-insights] Could not load activity logs "
            f"for {student_uid}: {exc}"
        )
        return state


def _persist_derived(
    student_uid: str | None,
    derived: DerivedOutput,
) -> None:
    """Write the derived AI output to Firestore after pipeline completion.

    Executed in a background thread so the /generate-insights response
    is not blocked by the write.

    Firestore writes per docs/student-state-schema.json:
    1. Heavy AI payload → ai_insights/latest subcollection.
    2. Lightweight risk summaries (readinessLevel, engagementLevel)
       → root document, for dashboard filtering and the recursion guard.

    Args:
        student_uid: Firestore document ID for the student.  No-op when
            None (e.g. when called without a studentUid in the request).
        derived: Complete DerivedOutput from the orchestrator.
    """
    if not student_uid:
        return

    doc_ref = db.collection("salesforce_opportunities").document(student_uid)

    # 1. Heavy payload — canonical subcollection per the schema contract.
    try:
        doc_ref.collection("ai_insights").document("latest").set(
            derived, merge=True
        )
        print(
            f"[Orchestrator] ai_insights/latest updated for {student_uid}."
        )
    except Exception as exc:  # noqa: BLE001
        print(
            f"[Orchestrator] ai_insights write failed for {student_uid}: {exc}"
        )

    # 2. Root-level summary fields — required for dashboard list filtering
    #    and the recursion guard (derived fields do not re-trigger AI).
    readiness_level: str | None = (
        derived.get("readinessRisk", {}).get("level")  # type: ignore[union-attr]
    )
    engagement_level: str | None = (
        derived.get("engagementRisk", {}).get("level")  # type: ignore[union-attr]
    )
    summary: dict[str, str] = {
        k: v
        for k, v in {
            "readinessLevel": readiness_level,
            "engagementLevel": engagement_level,
        }.items()
        if v is not None
    }
    if summary:
        try:
            doc_ref.set(summary, merge=True)
            print(
                f"[Orchestrator] Root risk levels updated for {student_uid}."
            )
        except Exception as exc:  # noqa: BLE001
            print(
                f"[Orchestrator] Root doc update failed for {student_uid}: {exc}"
            )


# ---------------------------------------------------------------------------
# Ingestion bridge endpoint  (BigQuery → Firestore)
# ---------------------------------------------------------------------------

@app.route("/sync-bq-to-firestore", methods=["POST"])
def sync_bq_to_firestore() -> Response:
    """Sync the full student dataset from BigQuery to Firestore.

    Reads from three BigQuery tables (student_core, student_courses,
    student_contingencies) and batch-writes hydrated documents to the
    salesforce_opportunities Firestore collection.

    Returns:
        JSON response with sync status and number of records synced,
        or an error message with HTTP 500 on failure.
    """
    print("[Ingestion Bridge] Starting BigQuery to Firestore sync...")

    course_map = _fetch_course_map()
    cont_map = _fetch_contingency_map()

    core_query: str = f"""
        SELECT
            student_id,
            student_name,
            institution,
            program,
            program_start_date,
            reserve_date,
            status_stage,
            funding_type,
            time_since_reserve_days,
            time_to_program_start_days,
            census_date,
            enrollment_specialist_name,
            last_updated_at
        FROM `{PROJECT_ID}.{DATASET_ID}.student_core`
    """

    try:
        rows = bq_client.query(query=core_query).result()
        synced_count, batch = _write_student_rows(
            rows=rows,
            course_map=course_map,
            cont_map=cont_map,
        )
        print(
            f"[Ingestion Bridge] Successfully synced {synced_count} "
            f"records to Firestore."
        )
        return jsonify({"status": "Success", "records_synced": synced_count})

    except Exception as exc:  # noqa: BLE001
        print(f"[Ingestion Bridge] Failed to sync data: {exc}")
        return jsonify({"status": "Failed", "error": str(exc)}), 500


def _fetch_course_map() -> dict[str, list[dict[str, Any]]]:
    """Fetch all student courses from BigQuery and group by student ID.

    Returns:
        Mapping of student_id -> list of course dicts.
    """
    query: str = (
        f"SELECT student_id, course_id, is_accredited, "
        f"course_registration_status, first_login_at, "
        f"first_discussion_post_at "
        f"FROM `{PROJECT_ID}.{DATASET_ID}.student_courses`"
    )
    course_map: dict[str, list[dict[str, Any]]] = {}
    for row in bq_client.query(query=query).result():
        student_id = str(row.student_id)
        course_map.setdefault(student_id, []).append({
            "courseId": row.course_id,
            "isAccredited": row.is_accredited,
            "registrationStatus": row.course_registration_status,
            "firstLoginAt": (
                row.first_login_at.isoformat()
                if row.first_login_at else None
            ),
            "firstDiscussionPostAt": (
                row.first_discussion_post_at.isoformat()
                if row.first_discussion_post_at else None
            ),
        })
    return course_map


def _fetch_contingency_map() -> dict[str, list[dict[str, Any]]]:
    """Fetch all student contingencies from BigQuery and group by student ID.

    Returns:
        Mapping of student_id -> list of contingency dicts.
    """
    query: str = (
        f"SELECT student_id, contingency_id, institution_name, "
        f"contingency_type, contingency_status "
        f"FROM `{PROJECT_ID}.{DATASET_ID}.student_contingencies`"
    )
    cont_map: dict[str, list[dict[str, Any]]] = {}
    for row in bq_client.query(query=query).result():
        student_id = str(row.student_id)
        cont_map.setdefault(student_id, []).append({
            "id": row.contingency_id,
            "institutionName": row.institution_name,
            "type": row.contingency_type,
            "status": row.contingency_status,
        })
    return cont_map


def _write_student_rows(
    rows: Any,
    course_map: dict[str, list[dict[str, Any]]],
    cont_map: dict[str, list[dict[str, Any]]],
) -> tuple[int, Any]:
    """Batch-write student core rows to Firestore.

    Commits every 500 documents to stay within Firestore batch limits.

    Args:
        rows: BigQuery RowIterator of student_core results.
        course_map: Pre-fetched course data keyed by student ID.
        cont_map: Pre-fetched contingency data keyed by student ID.

    Returns:
        Tuple of (total records synced, final uncommitted batch).
    """
    _BATCH_SIZE: int = 500

    batch = db.batch()
    synced_count: int = 0

    for row in rows:
        student_id = str(row.student_id)
        payload: dict[str, Any] = {
            "id": student_id,
            "name": row.student_name,
            "program": row.program,
            "institution": row.institution,
            "status": row.status_stage,
            "programStartDate": (
                row.program_start_date.isoformat()
                if row.program_start_date else None
            ),
            "reserveDate": (
                row.reserve_date.isoformat()
                if row.reserve_date else None
            ),
            "fundingType": row.funding_type,
            "timeSinceReserveDays": row.time_since_reserve_days,
            "timeToProgramStartDays": row.time_to_program_start_days,
            "censusDate": (
                row.census_date.isoformat()
                if row.census_date else None
            ),
            "enrollmentSpecialist": row.enrollment_specialist_name,
            "requirements": {
                "officialTranscriptsReceived": None,
                "fundingPlan": row.funding_type == "Approved" if row.funding_type else None,
                "orientationStarted": None,
                "dynamicTranscripts": [],
            },
            "courseActivity": course_map.get(student_id, []),
            "contingencies": cont_map.get(student_id, []),
            "lastUpdatedByPipelineAt": (
                row.last_updated_at.isoformat()
                if row.last_updated_at else None
            ),
        }
        doc_ref = db.collection("salesforce_opportunities").document(
            student_id
        )
        batch.set(doc_ref, payload, merge=True)
        synced_count += 1

        if synced_count % _BATCH_SIZE == 0:
            batch.commit()
            batch = db.batch()

    if synced_count % _BATCH_SIZE != 0:
        batch.commit()

    return synced_count, batch


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.route("/", methods=["GET"])
def health_check() -> Response:
    """Return service health status.

    Returns:
        JSON with service status string and version.
    """
    return jsonify({"status": "Python BigQuery Agent Online", "version": "2.0.0"})


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port: int = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
