"""Unit tests for RiskAgent.

All tests mock _call_llm() to avoid live Vertex AI calls, validating
the agent's contract: correct output shape, trace population, accumulated
context injection, error handling, and architecture constraints (no
Firestore, no cross-agent calls).

nextBestActions is no longer part of RiskAgent's output — it is owned
by NBAAgent.  These tests confirm that separation.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from agents.base import AccumulatedContext
from agents.risk_agent import RiskAgent


# ---------------------------------------------------------------------------
# Shared mock LLM responses
# ---------------------------------------------------------------------------

_VALID_LLM_RESPONSE: dict[str, Any] = {
    "engagementRisk": {
        "level": "Medium",
        "trendDirection": "stable",
        "trendNote": (
            "Last contact was a phone call on Feb 10. "
            "No recent inbound activity."
        ),
    },
    "overviewSummary": (
        "Amy is enrolled in MS Early Ed starting April 15th with "
        "9 days remaining. Federal funding is in place but onboarding "
        "checklist completion is unconfirmed. Proactive outreach is "
        "recommended before program start."
    ),
}

_VALID_LEVELS: frozenset[str] = frozenset({"High", "Medium", "Low"})


# ---------------------------------------------------------------------------
# Output contract tests
# ---------------------------------------------------------------------------

def test_run_returns_structured_output(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent returns correct output shape and Success trace when LLM succeeds."""
    agent = RiskAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["trace"]["agentName"] == "Risk Agent"
    assert result["trace"]["status"] == "Success"
    assert "engagementRisk" in result["output"]
    assert "overviewSummary" in result["output"]


def test_engagement_level_is_valid_enum(
    mock_student_state: dict[str, Any],
) -> None:
    """engagementRisk.level must be one of the three permitted values."""
    agent = RiskAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["output"]["engagementRisk"]["level"] in _VALID_LEVELS


def test_output_does_not_contain_next_best_actions(
    mock_student_state: dict[str, Any],
) -> None:
    """nextBestActions must NOT appear in RiskAgent output (owned by NBAAgent)."""
    agent = RiskAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert "nextBestActions" not in result["output"]


# ---------------------------------------------------------------------------
# Context injection tests
# ---------------------------------------------------------------------------

def test_readiness_context_appears_in_prompt(
    mock_student_state: dict[str, Any],
    mock_readiness_output: dict[str, Any],
) -> None:
    """Orchestrator-injected readiness context must appear in the prompt."""
    ctx = AccumulatedContext(readiness=mock_readiness_output)
    agent = RiskAgent()
    prompt = agent.build_prompt(state=mock_student_state, ctx=ctx)
    assert "readinessRisk" in prompt


def test_run_works_without_readiness_context(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent must not raise when no accumulated context is injected."""
    agent = RiskAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["trace"]["status"] == "Success"


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------

def test_run_handles_llm_failure(mock_student_state: dict[str, Any]) -> None:
    """Agent returns empty output and Failed trace on LLM exception.

    Must NOT raise — the error is captured in the trace so the
    orchestrator can detect it without crashing the pipeline.
    """
    agent = RiskAgent()
    with patch.object(
        agent, "_call_llm", side_effect=Exception("LLM timeout")
    ):
        result = agent.run(state=mock_student_state)

    assert "Failed" in result["trace"]["status"]
    assert result["output"] == {}


# ---------------------------------------------------------------------------
# Architecture constraint tests
# ---------------------------------------------------------------------------

def test_agent_has_no_firestore_client(
    mock_student_state: dict[str, Any],
) -> None:
    """BaseAgent must not hold a Firestore client (no state mutation)."""
    agent = RiskAgent()
    assert not hasattr(agent, "db")
