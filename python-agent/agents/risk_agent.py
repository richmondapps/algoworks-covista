"""Risk Agent — evaluates student engagement risk and generates an overview.

Domain responsibility: determine the student's engagement risk level based
on activity history, communication patterns, and case history.  Also
generates the holistic overview summary for the Enrollment Specialist,
leveraging readiness context accumulated by the orchestrator.

No Firestore, Flask, or HTTP dependencies (Clean Architecture — domain layer).
"""

from __future__ import annotations

import json
from typing import Any

from agents.base import AccumulatedContext, BaseAgent


class RiskAgent(BaseAgent):
    """Evaluates student engagement risk and produces an overview summary.

    Analyses activity logs, communication recency, case history, and
    engagement signals.  When accumulated context includes a readiness
    result, the prompt incorporates it to produce a more accurate holistic
    overview.

    Input keys used from state:
        Any activity/communication/case fields in the Firestore document.

    Input keys used from ctx:
        readiness (optional): ReadinessAgent output passed by the
            orchestrator for holistic context.

    Output keys (risk domain):
        engagementRisk: level / trendDirection / trendNote.
        overviewSummary: Holistic 3–4 sentence narrative for the ES.
    """

    name: str = "Risk Agent"
    action: str = "Evaluate Engagement Risk"
    context_key: str = "risk"

    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Build the LLM prompt with readiness context when available.

        Reads the readiness output from accumulated context so the model
        receives it as a separate section, yielding a more accurate
        holistic overview summary.

        Args:
            state: Full Firestore document for the student.
            ctx: Accumulated context; 'readiness' key used when present.

        Returns:
            Prompt string instructing the model to produce an engagement
            risk JSON object with holistic overview summary.
        """
        readiness_context: dict[str, Any] = (ctx or {}).get("readiness", {})
        return f"""
You are an expert academic advisor AI evaluating a student's engagement \
risk.
CRITICAL: You are speaking to an Enrollment Specialist (ES). \
Never address the student directly.
CRITICAL: For 'trendDirection', evaluate their engagement trajectory over \
the last 7 days based on communication and activity history.
CRITICAL: In 'overviewSummary', never address the student directly.

Readiness context from prior evaluation:
{json.dumps(readiness_context)}

Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "engagementRisk": {{
    "level": "High, Medium, or Low",
    "trendDirection": "up, down, or stable",
    "trendNote": "Short note identifying the latest Engagement activity."
  }},
  "overviewSummary": "A unified holistic narrative summarising BOTH \
readiness AND engagement in 3-4 cohesive sentences."
}}

STUDENT DATA:
{json.dumps(state)}
"""

    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Extract risk domain fields from the raw LLM response.

        Silently ignores unexpected extra keys and returns an empty dict
        when the required keys are absent, so the caller can detect
        partial failures without raising.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Dict containing 'engagementRisk' and/or 'overviewSummary'
            when present in raw.  Empty dict otherwise.
        """
        output: dict[str, Any] = {}
        if "engagementRisk" in raw:
            output["engagementRisk"] = raw["engagementRisk"]
        if "overviewSummary" in raw:
            output["overviewSummary"] = raw["overviewSummary"]
        return output
