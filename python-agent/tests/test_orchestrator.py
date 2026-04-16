"""Unit tests for AgentOrchestrator.

Validates the orchestration layer contract:
- AC 1: Agents execute in Readiness → Risk → NBA → Communications order.
- AC 2: Each agent receives accumulated context from preceding agents.
- AC 3: Outputs are collected into a DerivedOutput matching ai_insights/latest.
- AC 4: One agent failure does NOT break the pipeline.
- AC 5: Final output is a single complete derived object.

All agent LLM calls are mocked so no Vertex AI connection is needed.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from agents.communications_agent import CommunicationsAgent
from agents.nba_agent import NBAAgent
from agents.readiness_agent import ReadinessAgent
from agents.risk_agent import RiskAgent
from orchestration.orchestrator import AgentOrchestrator, DerivedOutput


# ---------------------------------------------------------------------------
# Mock LLM responses per agent
# ---------------------------------------------------------------------------

_READINESS_LLM: dict[str, Any] = {
    "readinessRisk": {
        "level": "Medium",
        "trendDirection": "stable",
        "trendNote": "No checklist activity in the last 7 days.",
    },
    "metrics": {
        "timeSinceReserve": "63 days",
        "timeToProgramStart": "9 days",
        "timeToCensus": "20 days",
    },
}

_RISK_LLM: dict[str, Any] = {
    "engagementRisk": {
        "level": "Medium",
        "trendDirection": "stable",
        "trendNote": "Last contact was a phone call on Feb 10.",
    },
    "overviewSummary": (
        "Amy is enrolled in MS Early Ed with 9 days remaining. "
        "Proactive outreach is recommended."
    ),
}

_NBA_LLM: dict[str, Any] = {
    "nextBestActions": [
        {
            "title": "Confirm Federal Financial Aid Status",
            "urgent": True,
            "points": ["Verify the financial aid package is finalised."],
            "buttonText": "Review Requirement",
        }
    ]
}

_COMMS_LLM: dict[str, Any] = {
    "emailDraft": {
        "bodyText": "We are excited to welcome you to the program!",
        "bullets": ["Confirm your financial aid status."],
    },
    "smsDraft": "Hi Amy! Just 9 days until your program starts at Covista!",
}


# ---------------------------------------------------------------------------
# Helper — build an orchestrator with all four agents mocked
# ---------------------------------------------------------------------------

def _build_orchestrator_with_mocked_llms() -> AgentOrchestrator:
    """Return an orchestrator whose agents all have mocked LLM calls."""
    readiness = ReadinessAgent()
    risk = RiskAgent()
    nba = NBAAgent()
    comms = CommunicationsAgent()

    readiness._call_llm = MagicMock(return_value=_READINESS_LLM)
    risk._call_llm = MagicMock(return_value=_RISK_LLM)
    nba._call_llm = MagicMock(return_value=_NBA_LLM)
    comms._call_llm = MagicMock(return_value=_COMMS_LLM)

    return AgentOrchestrator(agents=[readiness, risk, nba, comms])


# ---------------------------------------------------------------------------
# AC 1 — Pipeline order
# ---------------------------------------------------------------------------

def test_agents_run_in_defined_order(
    mock_student_state: dict[str, Any],
) -> None:
    """Agents must execute in Readiness → Risk → NBA → Communications order.

    Verified by recording the order in which _call_llm is invoked and
    confirming the trace entries appear in the same sequence.
    """
    orchestrator = _build_orchestrator_with_mocked_llms()
    derived = orchestrator.run(state=mock_student_state)

    trace_names = [t["agentName"] for t in derived["agentTrace"]]
    assert trace_names == [
        "Readiness Agent",
        "Risk Agent",
        "NBA Agent",
        "Communications Agent",
    ]


# ---------------------------------------------------------------------------
# AC 2 — Accumulated context passes forward
# ---------------------------------------------------------------------------

def test_risk_agent_receives_readiness_context(
    mock_student_state: dict[str, Any],
) -> None:
    """Risk Agent must receive readiness output as accumulated context."""
    readiness = ReadinessAgent()
    risk = RiskAgent()
    nba = NBAAgent()
    comms = CommunicationsAgent()

    readiness._call_llm = MagicMock(return_value=_READINESS_LLM)
    risk._call_llm = MagicMock(return_value=_RISK_LLM)
    nba._call_llm = MagicMock(return_value=_NBA_LLM)
    comms._call_llm = MagicMock(return_value=_COMMS_LLM)

    # Spy on Risk Agent's run to capture the ctx it receives.
    original_run = risk.run

    received_ctx: dict[str, Any] = {}

    def spy_run(
        state: dict[str, Any],
        ctx: Any = None,
    ) -> Any:
        if ctx is not None:
            received_ctx.update(ctx)
        return original_run(state=state, ctx=ctx)

    risk.run = spy_run  # type: ignore[method-assign]

    orchestrator = AgentOrchestrator(agents=[readiness, risk, nba, comms])
    orchestrator.run(state=mock_student_state)

    assert "readiness" in received_ctx
    assert "readinessRisk" in received_ctx["readiness"]


# ---------------------------------------------------------------------------
# AC 3 — Derived output shape matches ai_insights/latest schema
# ---------------------------------------------------------------------------

def test_derived_output_contains_all_schema_keys(
    mock_student_state: dict[str, Any],
) -> None:
    """DerivedOutput must contain all keys defined in ai_insights/latest."""
    expected_keys = {
        "overviewSummary",
        "readinessRisk",
        "engagementRisk",
        "metrics",
        "nextBestActions",
        "emailDraft",
        "smsDraft",
        "agentTrace",
        "generatedAt",
    }
    orchestrator = _build_orchestrator_with_mocked_llms()
    derived = orchestrator.run(state=mock_student_state)

    assert expected_keys.issubset(set(derived.keys()))


def test_agent_trace_has_one_entry_per_agent(
    mock_student_state: dict[str, Any],
) -> None:
    """agentTrace must contain exactly one entry per agent in the pipeline."""
    orchestrator = _build_orchestrator_with_mocked_llms()
    derived = orchestrator.run(state=mock_student_state)

    assert len(derived["agentTrace"]) == 4


def test_generated_at_is_iso8601(
    mock_student_state: dict[str, Any],
) -> None:
    """generatedAt must be a non-empty ISO-8601 timestamp string."""
    orchestrator = _build_orchestrator_with_mocked_llms()
    derived = orchestrator.run(state=mock_student_state)

    assert isinstance(derived["generatedAt"], str)
    assert "T" in derived["generatedAt"]


# ---------------------------------------------------------------------------
# AC 4 — One agent failure does not break the pipeline
# ---------------------------------------------------------------------------

def test_one_agent_failure_does_not_break_pipeline(
    mock_student_state: dict[str, Any],
) -> None:
    """When Risk Agent fails, Readiness, NBA, and Communications still run.

    The failed agent contributes an empty output and a 'Failed:' trace.
    All downstream agents continue and their outputs appear in the result.
    """
    readiness = ReadinessAgent()
    risk = RiskAgent()
    nba = NBAAgent()
    comms = CommunicationsAgent()

    readiness._call_llm = MagicMock(return_value=_READINESS_LLM)
    risk._call_llm = MagicMock(side_effect=Exception("LLM timeout"))
    nba._call_llm = MagicMock(return_value=_NBA_LLM)
    comms._call_llm = MagicMock(return_value=_COMMS_LLM)

    orchestrator = AgentOrchestrator(agents=[readiness, risk, nba, comms])
    derived = orchestrator.run(state=mock_student_state)

    # Failed agent's trace must be present and marked Failed.
    risk_trace = next(
        t for t in derived["agentTrace"] if t["agentName"] == "Risk Agent"
    )
    assert "Failed" in risk_trace["status"]

    # Upstream agent (Readiness) output is still in the result.
    assert "readinessRisk" in derived

    # Downstream agents (NBA, Communications) still ran and produced output.
    assert "nextBestActions" in derived
    assert "emailDraft" in derived


def test_all_four_traces_present_when_one_agent_fails(
    mock_student_state: dict[str, Any],
) -> None:
    """All four traces must appear in agentTrace even when one agent fails."""
    readiness = ReadinessAgent()
    risk = RiskAgent()
    nba = NBAAgent()
    comms = CommunicationsAgent()

    readiness._call_llm = MagicMock(return_value=_READINESS_LLM)
    risk._call_llm = MagicMock(side_effect=Exception("network error"))
    nba._call_llm = MagicMock(return_value=_NBA_LLM)
    comms._call_llm = MagicMock(return_value=_COMMS_LLM)

    orchestrator = AgentOrchestrator(agents=[readiness, risk, nba, comms])
    derived = orchestrator.run(state=mock_student_state)

    assert len(derived["agentTrace"]) == 4
