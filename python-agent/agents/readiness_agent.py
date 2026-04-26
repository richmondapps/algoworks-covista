"""Readiness Agent — evaluates student onboarding and academic readiness.

Domain responsibility: distil checklist flags and temporal data into a
summary "Readiness Status" for the Enrollment Specialist.

This agent operates purely deterministically! Generative AI generation
has been stripped in favor of absolute condition matching to eliminate hallucinations.
"""

from __future__ import annotations
import datetime
from typing import Any

from agents.base import AccumulatedContext, BaseAgent, AgentResult, AgentTrace

class ReadinessAgent(BaseAgent):
    """Evaluates student onboarding and academic readiness deterministically.

    Input keys used from state:
        requirements: Dictionary of checklist flags.
        timeSinceReserveDays: Numeric value indicating onboarding duration.
        timeUntilClassStartDays: Numeric value indicating time left.
    """

    name: str = "Readiness Agent"
    action: str = "Evaluate Readiness Status"
    context_key: str = "readiness"

    def run(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> AgentResult:
        """Override base run method to execute deterministically without Vertex AI."""
        start_t = datetime.datetime.now(datetime.timezone.utc)
        
        req = state.get("requirements", {})
        
        # Compute Days Dynamically to evaluate active tier
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        ui_date_str = state.get("uiCalculatedDateStr")
        if ui_date_str:
            try:
                now_date = datetime.datetime.strptime(ui_date_str, "%Y-%m-%d").date()
            except Exception:
                now_date = now_utc.date()
        else:
            now_date = now_utc.date()

        start_str = state.get("programStartDate")
        if start_str:
            try:
                start_date = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=datetime.timezone.utc)
                time_start = (start_date.date() - now_date).days
            except Exception:
                time_start = state.get("timeUntilClassStartDays", 0)
        else:
            time_start = state.get("timeUntilClassStartDays", 0)

        # Determine Readiness Level
        completed = 0
        if req.get("initialPortalLogin", False): completed += 1
        if req.get("fafsaSubmitted", False): completed += 1
        if req.get("courseRegistration", False): completed += 1
        if req.get("wowOrientation", False): completed += 1

        # Only evaluate actual class participation actions if the program has already started
        req_max = 4
        if time_start <= 0:
            req_max = 6
            if req.get("courseLogin", False): completed += 1
            if req.get("classParticipation", False): completed += 1

        level = "Low"
        if completed == req_max:
            level = "High"
        elif completed >= (req_max / 2):
            level = "Medium"

        reserve_str = state.get("reserveDate")
        if reserve_str:
            try:
                reserve_date = datetime.datetime.fromisoformat(reserve_str.replace("Z", "+00:00")).replace(tzinfo=datetime.timezone.utc)
                time_since = max(0, (now_date - reserve_date.date()).days)
            except Exception:
                time_since = state.get("timeSinceReserveDays", 0)
        else:
            time_since = state.get("timeSinceReserveDays", 0)

        # Build clean verb-noun trend note instead of AI hallucinations
        trend_note = f"Reserved {time_since} days ago"

        out = {
            "readinessLevel": {
                "level": level,
                "trendNote": trend_note
            },
            "metrics": {
                "timeSinceReserve": f"{time_since} days",
                "timeToProgramStart": f"{time_start} days",
                "timeToCensus": "0 days"
            }
        }
        
        end_t = datetime.datetime.now(datetime.timezone.utc)
        
        trace = AgentTrace(
            agentName=self.name,
            action=self.action,
            status="Success",
            duration=f"{(end_t - start_t).total_seconds():.3f}s",
            timestamp=end_t.isoformat()
        )
        return AgentResult(output=out, trace=trace)

    def build_prompt(self, state: dict[str, Any], ctx: AccumulatedContext | None = None) -> str:
        return ""
    
    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        return {}
