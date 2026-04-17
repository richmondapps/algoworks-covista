"""Communications Agent — drafts personalised outreach for Enrollment Specialists.

Domain responsibility: generate contextually appropriate email and SMS drafts
that the Enrollment Specialist can review and send to the student.  Drafts
incorporate the top recommended action from NBA context to ensure outreach is
directly relevant to the student's current situation.

No Firestore, Flask, or HTTP dependencies (Clean Architecture — domain layer).
"""

from __future__ import annotations

import json
from typing import Any

from agents.base import AccumulatedContext, BaseAgent


# Maximum character limit for SMS drafts (carrier constraint).
_SMS_MAX_CHARS: int = 140


class CommunicationsAgent(BaseAgent):
    """Generates personalised email and SMS drafts addressed to the student.

    Distinct from ReadinessAgent and RiskAgent in that its output is
    addressed directly TO the student, not to the Enrollment Specialist.
    The ES reviews the drafts before sending.

    When accumulated context includes NBA output, the top recommended
    action is injected into the prompt so drafts are aligned with the
    current priority.

    Input keys used from state:
        student_name: Used for personalisation.
        enrollment_specialist_name: Attributed in the email body.
        notes (optional): Recent interaction notes that shape tone.
        Any other fields that provide context for personalisation.

    Input keys used from ctx:
        nba (optional): NBAAgent output; top action used to align drafts.

    Output keys (communications domain):
        emailDraft: bodyText (no greeting) and bullets list.
        smsDraft: String ≤ 140 characters, addressed to the student.
    """

    name: str = "Communications Agent"
    action: str = "Generate Outreach Drafts"
    context_key: str = "communications"

    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Build the LLM prompt from the current student state.

        Includes the top recommended action from accumulated NBA context
        when available, so the email and SMS are explicitly aligned with
        the ES's highest-priority recommendation.

        Args:
            state: Full Firestore document for the student, including
                any notes or prior interaction context that should
                influence tone.
            ctx: Accumulated context; 'nba' key used when present to
                surface the top recommended action in the draft.

        Returns:
            Prompt string instructing the model to produce a
            communications JSON object with email and SMS drafts.
        """
        nba_actions: list[dict[str, Any]] = (
            (ctx or {}).get("nba", {}).get("nextBestActions", [])
        )
        top_action_section: str = ""
        if nba_actions:
            top_action_section = (
                f"\nTop recommended action to reference in your drafts:\n"
                f"{json.dumps(nba_actions[0])}\n"
            )
        return f"""
You are an expert academic advisor AI (Communications Agent). \
Given the raw student data context, generate personalised outreach \
drafts TO THE STUDENT.
CRITICAL: Ensure your drafts reflect recent 'notes' sentiment \
(e.g., extremely empathetic if health/death, excited if normal).
CRITICAL: The smsDraft must be under {_SMS_MAX_CHARS} characters.
{top_action_section}
Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "emailDraft": {{
    "bodyText": "A friendly, customised 2-paragraph body text. \
DO NOT include any greeting or salutation.",
    "bullets": ["Specific actionable task 1"]
  }},
  "smsDraft": "Short, friendly text STRICTLY addressed directly \
TO THE STUDENT. Under {_SMS_MAX_CHARS} chars."
}}

STUDENT DATA:
{json.dumps(state)}
"""

    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Extract communications domain fields from the raw LLM response.

        Silently ignores unexpected extra keys and returns an empty dict
        when the required keys are absent, so the caller can detect
        partial failures without raising.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Dict containing 'emailDraft' and/or 'smsDraft' when present
            in the raw payload.  Empty dict otherwise.
        """
        output: dict[str, Any] = {}
        if "emailDraft" in raw:
            output["emailDraft"] = raw["emailDraft"]
        if "smsDraft" in raw:
            output["smsDraft"] = raw["smsDraft"]
        return output
