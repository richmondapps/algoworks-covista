"""Unit tests for ReadinessAgent.

All tests mock _call_llm() to avoid live Vertex AI calls, validating
the agent's contract: correct output shape, trace population, error
handling, and architecture constraints (no Firestore, no cross-agent
calls).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from agents.readiness_agent import ReadinessAgent


# ---------------------------------------------------------------------------
# Shared mock LLM responses
# ---------------------------------------------------------------------------

_VALID_LLM_RESPONSE: dict[str, Any] = {
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

_VALID_LEVELS: frozenset[str] = frozenset({"High", "Medium", "Low"})
_VALID_TRENDS: frozenset[str] = frozenset({"up", "down", "stable"})


# ---------------------------------------------------------------------------
# Output contract tests
# ---------------------------------------------------------------------------

def test_run_returns_structured_output(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent returns correct output shape and Success trace when LLM succeeds."""
    agent = ReadinessAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["trace"]["agentName"] == "Readiness Agent"
    assert result["trace"]["status"] == "Success"
    assert result["trace"]["action"] == "Evaluate Student Readiness"
    assert "readinessRisk" in result["output"]
    assert "metrics" in result["output"]


def test_readiness_level_is_valid_enum(
    mock_student_state: dict[str, Any],
) -> None:
    """readinessRisk.level must be one of the three permitted values."""
    agent = ReadinessAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["output"]["readinessRisk"]["level"] in _VALID_LEVELS


def test_trend_direction_is_valid_enum(
    mock_student_state: dict[str, Any],
) -> None:
    """readinessRisk.trendDirection must be one of the three permitted values."""
    agent = ReadinessAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["output"]["readinessRisk"]["trendDirection"] in _VALID_TRENDS


def test_metrics_keys_present(mock_student_state: dict[str, Any]) -> None:
    """metrics object must contain the three required timing keys."""
    agent = ReadinessAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    metrics = result["output"]["metrics"]
    assert "timeSinceReserve" in metrics
    assert "timeToProgramStart" in metrics
    assert "timeToCensus" in metrics


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------

def test_run_handles_llm_failure(mock_student_state: dict[str, Any]) -> None:
    """Agent returns empty output and Failed trace on LLM exception.

    Must NOT raise — the error is captured in the trace so the
    orchestrator can detect it without crashing the pipeline.
    """
    agent = ReadinessAgent()
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
    agent = ReadinessAgent()
    assert not hasattr(agent, "db")


def test_build_prompt_contains_student_data(
    mock_student_state: dict[str, Any],
) -> None:
    """Prompt must include the student's name for adequate LLM context."""
    agent = ReadinessAgent()
    prompt = agent.build_prompt(state=mock_student_state)
    assert "Amy Collins" in prompt
