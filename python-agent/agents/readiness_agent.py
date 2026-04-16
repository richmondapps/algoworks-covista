"""Readiness Agent — evaluates a student's onboarding and academic readiness.

Domain responsibility: determine how prepared the student is to start their
program, based on checklist completion, timing context, and milestone
history.  Returns a readiness risk level and timing metrics.

No Firestore, Flask, or HTTP dependencies (Clean Architecture — domain layer).
"""

from __future__ import annotations

import json
from typing import Any

from agents.base import AccumulatedContext, BaseAgent


class ReadinessAgent(BaseAgent):
    """Evaluates student onboarding and academic readiness.

    Analyses checklist completion, timing signals (days to program start,
    days to census), and milestone history.  Produces a readiness risk
    classification and a set of timing metrics for the Enrollment
    Specialist dashboard.

    Input keys used from state:
        requirements: Dict of boolean checklist flags.
        time_to_program_start_days: Days until program start.
        time_since_reserve_days: Days since the student reserved.
        census_date: ISO-8601 date string for the census deadline.

    Output keys (readiness domain):
        readinessRisk: level / trendDirection / trendNote.
        metrics: timeSinceReserve / timeToProgramStart / timeToCensus.
    """

    name: str = "Readiness Agent"
    action: str = "Evaluate Student Readiness"
    context_key: str = "readiness"

    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Build the LLM prompt from the student state.

        Args:
            state: Full Firestore document for the student.
            ctx: Accumulated context from prior agents.  Not used by
                this agent — Readiness runs first in the pipeline.

        Returns:
            Prompt string instructing the model to produce a readiness
            risk JSON object with metrics.
        """
        return f"""
You are an expert academic advisor AI evaluating a student's onboarding \
and academic readiness.
CRITICAL: You are speaking to an Enrollment Specialist (ES). \
Never address the student directly.
CRITICAL: For 'trendDirection', evaluate their trajectory over the last \
7 days based on checklist activity. If they are new, return 'stable'.

Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "readinessRisk": {{
    "level": "High, Medium, or Low",
    "trendDirection": "up, down, or stable",
    "trendNote": "Short note identifying the latest Readiness activity."
  }},
  "metrics": {{
    "timeSinceReserve": "Number and Days (e.g., '5 days')",
    "timeToProgramStart": "Number and Days (e.g., '14 days')",
    "timeToCensus": "Number and Days (e.g., '21 days')"
  }}
}}

STUDENT DATA:
{json.dumps(state)}
"""

    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Extract readiness domain fields from the raw LLM response.

        Silently ignores unexpected extra keys and returns an empty dict
        when the required keys are absent, so the caller can detect
        partial failures without raising.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Dict containing 'readinessRisk' and/or 'metrics' when
            present in the raw payload.  Empty dict otherwise.
        """
        output: dict[str, Any] = {}
        if "readinessRisk" in raw:
            output["readinessRisk"] = raw["readinessRisk"]
        if "metrics" in raw:
            output["metrics"] = raw["metrics"]
        return output
