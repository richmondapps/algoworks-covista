"""NBA Agent — generates prioritised Next Best Actions for Enrollment Specialists.

Domain responsibility: recommend the most impactful actions the Enrollment
Specialist should take, grounded in the student's readiness and engagement
risk context accumulated by the orchestrator.

No Firestore, Flask, or HTTP dependencies (Clean Architecture — domain layer).
"""

from __future__ import annotations

import json
from typing import Any

from agents.base import AccumulatedContext, BaseAgent


class NBAAgent(BaseAgent):
    """Generates a prioritised Next Best Actions list for the ES.

    Distinct from RiskAgent in that it is solely focused on translating
    the combined readiness + engagement risk context into concrete,
    actionable steps.  Receiving both assessments allows the model to
    rank actions by urgency and impact.

    Input keys used from ctx:
        readiness (optional): ReadinessAgent output for checklist context.
        risk (optional): RiskAgent output for engagement context.

    Output keys (NBA domain):
        nextBestActions: Prioritised list of action items for the ES.
            Each item: title, urgent, points[], buttonText.
            buttonText must be exactly "Review Requirement" or
            "Complete Task >".
    """

    name: str = "NBA Agent"
    action: str = "Generate Next Best Actions"
    context_key: str = "nba"

    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Build the LLM prompt using accumulated readiness and risk context.

        Args:
            state: Full Firestore document for the student.
            ctx: Accumulated context; 'readiness' and 'risk' keys used
                when present to ground the recommended actions.

        Returns:
            Prompt string instructing the model to produce a
            nextBestActions JSON array.
        """
        context: dict[str, Any] = ctx or {}
        readiness_context: dict[str, Any] = context.get("readiness", {})
        risk_context: dict[str, Any] = context.get("risk", {})
        return f"""
You are an expert academic advisor AI generating Next Best Actions for an \
Enrollment Specialist.
CRITICAL: You are speaking to an Enrollment Specialist (ES). \
Never address the student directly.
CRITICAL: For 'buttonText', set it EXACTLY to "Review Requirement" or \
"Complete Task >". No other values are allowed.
CRITICAL: Review the student's checklist. IF they completed 100%, \
do NOT invent missing tasks — pivot to keeping them engaged.
CRITICAL: All action points must instruct the ES, NOT the student.

Readiness assessment from prior evaluation:
{json.dumps(readiness_context)}

Engagement risk assessment from prior evaluation:
{json.dumps(risk_context)}

Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "nextBestActions": [
    {{
      "title": "Action title explicitly commanding the ES",
      "urgent": true,
      "points": ["Step-by-step instructions for the ES, NOT the student."],
      "buttonText": "Review Requirement"
    }}
  ]
}}

STUDENT DATA:
{json.dumps(state)}
"""

    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Extract NBA domain fields from the raw LLM response.

        Silently ignores unexpected extra keys and returns an empty dict
        when the required keys are absent, so the caller can detect
        partial failures without raising.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Dict containing 'nextBestActions' when present in raw.
            Empty dict otherwise.
        """
        if "nextBestActions" not in raw:
            return {}
        return {"nextBestActions": raw["nextBestActions"]}
