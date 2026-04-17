"""Shared pytest fixtures for the Covista agent unit test suite.

All fixtures return plain dicts that mirror the Firestore
salesforce_opportunities document shape, so agent tests can run
without any live database or Vertex AI connection.
"""

from __future__ import annotations

from typing import Any

import pytest


@pytest.fixture
def mock_student_state() -> dict[str, Any]:
    """Return a realistic Firestore student document for Amy Collins.

    Mirrors the salesforce_opportunities/{student_id} shape defined in
    docs/student-state-schema.json.  Used as the primary input fixture
    across all agent unit tests.

    Returns:
        Dict representing a fully-hydrated student Firestore document.
    """
    return {
        "student_id": "A00302996",
        "student_name": "Amy Collins",
        "institution": "Covista University",
        "program": "MSEL",
        "program_name": "MS Early Ed",
        "term_code": "2026-T1",
        "term_desc": "Spring 2026",
        "status_stage": "Enrolled",
        "enrollment_specialist_name": "Jennifer Lawson",
        "funding_type": "Federal",
        "program_start_date": "2026-04-15T04:00:00.000Z",
        "reserve_date": "2026-02-01T04:00:00.000Z",
        "census_date": "2026-04-25T04:00:00.000Z",
        "time_to_program_start_days": 9,
        "time_since_reserve_days": 63,
        "last_updated_at": "2026-04-05T22:48:53.425Z",
        "requirements": {
            "fafsaSubmitted": True,
            "fundingPlan": True,
            "courseRegistration": False,
            "orientationStarted": True,
            "officialTranscriptsReceived": True,
            "nursingLicenseReceived": False,
            "firstAssignmentSubmitted": False,
            "assignmentByCensusDay": False,
        },
    }


@pytest.fixture
def mock_readiness_output() -> dict[str, Any]:
    """Return a realistic ReadinessAgent output for Amy Collins.

    Used to build an AccumulatedContext in tests for agents that depend
    on prior readiness evaluation (RiskAgent, NBAAgent).

    Returns:
        Dict with 'readinessRisk' and 'metrics' keys matching the
        ReadinessAgent output contract.
    """
    return {
        "readinessRisk": {
            "level": "Medium",
            "trendDirection": "stable",
            "trendNote": "No checklist activity recorded in the last 7 days.",
        },
        "metrics": {
            "timeSinceReserve": "63 days",
            "timeToProgramStart": "9 days",
            "timeToCensus": "20 days",
        },
    }


@pytest.fixture
def mock_risk_output() -> dict[str, Any]:
    """Return a realistic RiskAgent output for Amy Collins.

    Used to build an AccumulatedContext in tests for NBAAgent and
    CommunicationsAgent that depend on prior engagement risk evaluation.

    Returns:
        Dict with 'engagementRisk' and 'overviewSummary' keys matching
        the RiskAgent output contract.
    """
    return {
        "engagementRisk": {
            "level": "Medium",
            "trendDirection": "stable",
            "trendNote": "Last contact was a phone call on Feb 10.",
        },
        "overviewSummary": (
            "Amy is enrolled in MS Early Ed starting April 15th with "
            "9 days remaining. Federal funding is in place but onboarding "
            "checklist completion is unconfirmed."
        ),
    }
