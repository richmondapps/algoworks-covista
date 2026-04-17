"""Unit tests for CommunicationsAgent.

All tests mock _call_llm() to avoid live Vertex AI calls, validating
the agent's contract: correct output shape, trace population, SMS
length constraint, error handling, and architecture constraints (no
Firestore, no cross-agent calls).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from agents.communications_agent import CommunicationsAgent, _SMS_MAX_CHARS


# ---------------------------------------------------------------------------
# Shared mock LLM responses
# ---------------------------------------------------------------------------

_VALID_LLM_RESPONSE: dict[str, Any] = {
    "emailDraft": {
        "bodyText": (
            "We're so excited to welcome you to the MS Early Ed program "
            "at Covista University! With your program starting on April "
            "15th, Jennifer Lawson and the entire team are here to ensure "
            "you have a smooth transition."
        ),
        "bullets": [
            "Confirm your financial aid disbursement status in your "
            "student portal.",
            "Review the orientation schedule and materials available online.",
        ],
    },
    "smsDraft": (
        "Hi Amy! Just 9 days until your MS Early Ed program starts "
        "at Covista! Let us know if you need anything!"
    ),
}


# ---------------------------------------------------------------------------
# Output contract tests
# ---------------------------------------------------------------------------

def test_run_returns_structured_output(
    mock_student_state: dict[str, Any],
) -> None:
    """Agent returns correct output shape and Success trace when LLM succeeds."""
    agent = CommunicationsAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert result["trace"]["agentName"] == "Communications Agent"
    assert result["trace"]["status"] == "Success"
    assert "emailDraft" in result["output"]
    assert "smsDraft" in result["output"]


def test_email_draft_has_required_keys(
    mock_student_state: dict[str, Any],
) -> None:
    """emailDraft must contain 'bodyText' and 'bullets'."""
    agent = CommunicationsAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    email = result["output"]["emailDraft"]
    assert "bodyText" in email
    assert "bullets" in email
    assert isinstance(email["bullets"], list)


def test_sms_draft_within_character_limit(
    mock_student_state: dict[str, Any],
) -> None:
    """smsDraft must not exceed the carrier-imposed character limit."""
    agent = CommunicationsAgent()
    with patch.object(agent, "_call_llm", return_value=_VALID_LLM_RESPONSE):
        result = agent.run(state=mock_student_state)

    assert len(result["output"]["smsDraft"]) <= _SMS_MAX_CHARS


def test_build_prompt_contains_student_name(
    mock_student_state: dict[str, Any],
) -> None:
    """Prompt must include the student's name for personalisation context."""
    agent = CommunicationsAgent()
    prompt = agent.build_prompt(state=mock_student_state)
    assert "Amy Collins" in prompt


def test_build_prompt_includes_sms_limit(
    mock_student_state: dict[str, Any],
) -> None:
    """Prompt must reference the SMS character limit constant."""
    agent = CommunicationsAgent()
    prompt = agent.build_prompt(state=mock_student_state)
    assert str(_SMS_MAX_CHARS) in prompt


# ---------------------------------------------------------------------------
# Error handling tests
# ---------------------------------------------------------------------------

def test_run_handles_llm_failure(mock_student_state: dict[str, Any]) -> None:
    """Agent returns empty output and Failed trace on LLM exception.

    Must NOT raise — the error is captured in the trace so the
    orchestrator can detect it without crashing the pipeline.
    """
    agent = CommunicationsAgent()
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
    agent = CommunicationsAgent()
    assert not hasattr(agent, "db")
