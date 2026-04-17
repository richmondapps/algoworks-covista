"""Unit tests for NBAAgent.

All tests mock _call_llm() to avoid live Vertex AI calls, validating
the agent's contract: correct output shape, trace population, accumulated
context injection, buttonText enum validation, error handling, and
architecture constraints (no Firestore, no cross-agent calls).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from agents.base import AccumulatedContext
from agents.nba_agent import NBAAgent


# ---------------------------------------------------------------------------
# Shared mock LLM responses
# ---------------------------------------------------------------------------

_VALID_LLM_RESPONSE: dict[str, Any] = {
    "nextBestActions": [
        {
            "title": "Confirm Federal Financial Aid Status",
            "urgent": True,
            "points": [
                "Verify the student's federal financial aid package "
                "is finalised and scheduled for disbursement.",
                "Confirm there are no outstanding holds preventing "
                "disbursement.",
            ],
            "buttonText": "Review Requirement",
        },
        {
            "title": "Initiate Proactive Outreach to Student",
            "urgent": False,
            "points": [
                "Contact the student to offer support and confirm "
                "readiness for program start.",
            ],
            "buttonText": "Complete Task >",
        },
    ]
}

_VALID_BUTTON_TEXTS: frozenset[str] = frozenset(
    {"Review Requirement", "Complete Task >"}
)


# ---------------------------------------------------------------------------
# Output contract tests
# ---------------------------------------------------------------------------

def test_run_returns_structured_output(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent returns correct output shape and Success trace when LLM succeeds."""
    agent = NBAAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["trace"]["agentName"] == "NBA Agent"
    assert result["trace"]["status"] == "Success"
    assert "nextBestActions" in result["output"]


def test_next_best_actions_is_non_empty_list(
    mock_student_state: dict[str, Any],
) -> None:
    """nextBestActions must be a non-empty list."""
    agent = NBAAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    actions = result["output"]["nextBestActions"]
    assert isinstance(actions, list)
    assert len(actions) > 0


def test_button_text_values_are_valid_enum(
    mock_student_state: dict[str, Any],
) -> None:
    """Every buttonText must be exactly 'Review Requirement' or 'Complete Task >'."""
    agent = NBAAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    for action in result["output"]["nextBestActions"]:
        assert action["buttonText"] in _VALID_BUTTON_TEXTS


def test_each_action_has_required_keys(
    mock_student_state: dict[str, Any],
) -> None:
    """Each action item must contain title, urgent, points, and buttonText."""
    agent = NBAAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    for action in result["output"]["nextBestActions"]:
        assert "title" in action
        assert "urgent" in action
        assert "points" in action
        assert isinstance(action["points"], list)
        assert "buttonText" in action


# ---------------------------------------------------------------------------
# Context injection tests
# ---------------------------------------------------------------------------

def test_readiness_context_appears_in_prompt(
    mock_student_state: dict[str, Any],
    mock_readiness_output: dict[str, Any],
) -> None:
    """Accumulated readiness context must appear in the NBA prompt."""
    ctx = AccumulatedContext(readiness=mock_readiness_output)
    agent = NBAAgent()
    prompt = agent.build_prompt(state=mock_student_state, ctx=ctx)
    assert "readinessRisk" in prompt


def test_risk_context_appears_in_prompt(
    mock_student_state: dict[str, Any],
    mock_risk_output: dict[str, Any],
) -> None:
    """Accumulated risk context must appear in the NBA prompt."""
    ctx = AccumulatedContext(risk=mock_risk_output)
    agent = NBAAgent()
    prompt = agent.build_prompt(state=mock_student_state, ctx=ctx)
    assert "engagementRisk" in prompt


def test_run_works_without_accumulated_context(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent must not raise when no accumulated context is injected."""
    agent = NBAAgent()
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
    agent = NBAAgent()
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
    agent = NBAAgent()
    assert not hasattr(agent, "db")
