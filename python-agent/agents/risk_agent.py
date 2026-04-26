"""Risk Agent — evaluates student engagement risk and generates an overview.

Domain responsibility: determine the student's engagement risk level based
on activity history, communication patterns, and case history.  Also
generates the holistic overview summary for the Enrollment Specialist,
leveraging readiness context accumulated by the orchestrator.

This agent utilizes a Hybrid approach! Generative AI generation
has been stripped from the `engagementRisk` structural component to guarantee logic mapping,
while Vertex AI is retained solely for crafting the final `overviewSummary` paragraph.
"""

from __future__ import annotations
import datetime
import json
import time
from typing import Any

from agents.base import AccumulatedContext, BaseAgent, AgentResult, AgentTrace

class RiskAgent(BaseAgent):
    """Evaluates student engagement risk deterministically, and summarizes narratively.

    Input keys used from state:
        stats: Dictionary of numeric engagements (emailOpens, smsClicks).

    Input keys used from ctx:
        nba: The generated next best actions array.
        readiness: ReadinessAgent output passed by the orchestrator.
        
    Output keys (risk domain):
        engagementRisk: level / trendDirection / trendNote (calculated deterministically).
        overviewSummary: Holistic 3–4 sentence narrative for the ES (generative AI).
    """

    name: str = "Risk Agent"
    action: str = "Evaluate Engagement Risk"
    context_key: str = "risk"

    def run(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> AgentResult:
        """Override base run method to separate structural logic from AI."""
        start_t = datetime.datetime.now(datetime.timezone.utc)
        status = "Success"
        out: dict[str, Any] = {}
        
        # 1. Deterministic Calculation for Engagement Risk
        now = datetime.datetime.now(datetime.timezone.utc)
        recent_logs = state.get("recentActivityLogs", [])
        
        def is_engagement(log_dict: dict) -> bool:
            cat = str(log_dict.get("activity_category", "")).lower()
            if cat == "systemevent":
                return False
            name = str(log_dict.get("activity_name", "")).lower()
            direction = str(log_dict.get("interaction_direction", "")).lower()
            status = str(log_dict.get("task_status", "")).lower()
            
            if direction == "inbound" or status in ("received", "talked to"):
                return True
            if cat in ("engagement", "student_event"):
                return True
            if "sms" in name or "email" in name or "call" in name:
                return True
            return False

        latest_engagement_dt = None
        interactions_count = 0
        methods = set()
        
        for log in recent_logs:
            if is_engagement(log):
                interactions_count += 1
                methods.add(str(log.get("communication_type") or log.get("activity_category", "System")).title())
                dt_str = log.get("activity_datetime")
                if dt_str:
                    try:
                        clean_dt = dt_str.replace("Z", "+00:00")
                        dt = datetime.datetime.fromisoformat(clean_dt)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=datetime.timezone.utc)
                        if latest_engagement_dt is None or dt > latest_engagement_dt:
                            latest_engagement_dt = dt
                    except Exception:
                        pass

        days_since_engagement = float('inf')
        if latest_engagement_dt:
            delta = now - latest_engagement_dt
            days_since_engagement = max(0, delta.total_seconds() / 86400.0)

        days_to_start = state.get("timeToProgramStartDays")
        if days_to_start is None:
            program_start = state.get("programStartDate")
            if program_start:
                try:
                    ps_dt = datetime.datetime.fromisoformat(program_start.replace("Z", "+00:00"))
                    if ps_dt.tzinfo is None:
                        ps_dt = ps_dt.replace(tzinfo=datetime.timezone.utc)
                    days_to_start = (ps_dt - now).total_seconds() / 86400.0
                except Exception:
                    days_to_start = 30
            else:
                days_to_start = 30

        if days_to_start < 28:
            if days_since_engagement <= 3:
                level = "High"
                trend_note = f"Recent engagement within 3 days."
            elif days_since_engagement <= 7:
                level = "Medium"
                trend_note = f"No sign of life for > 3 days ({int(days_since_engagement)}d)."
            else:
                level = "Low"
                trend_note = f"No sign of life for > 7 days."
        else:
            if days_since_engagement <= 5:
                level = "High"
                trend_note = f"Recent engagement within 5 days."
            elif days_since_engagement <= 10:
                level = "Medium"
                trend_note = f"No sign of life for > 5 days ({int(days_since_engagement)}d)."
            else:
                level = "Low"
                trend_note = f"No sign of life for > 10 days."

        interactions = interactions_count
        clean_methods = [m.replace("_", " ").title() for m in list(methods)[:2]]
        methods_str = " and ".join(clean_methods) or "various channels"
            
        engagement_level = {
            "level": level,
            "trendNote": trend_note
        }
        
        out["engagementLevel"] = engagement_level
        
        # 2. Generative AI for Overview Summary Only
        context: dict[str, Any] = ctx or {}
        readiness_context: dict[str, Any] = context.get("readiness", {})
        nba_context: dict[str, Any] = context.get("nba", {})
        recent_activity_context = state.get("recentActivitySummary", [])
        
        interaction_instruction = f"""CRITICAL: You must explicitly structure the VERY FIRST sentence of your summary to state exactly how many times the student has interacted and the specific method/channel used (e.g., "The student has interacted {interactions} time(s) via {methods_str}.")."""
        if interactions == 0:
            interaction_instruction = """CRITICAL: You must explicitly structure the VERY FIRST sentence of your summary to state: "There has been no communication or engagement tracked from the student yet."."""

        prompt = f"""
You are an expert academic advisor AI evaluating a student's holistic health.
Synthesize a 3-5 line comprehensive narrative summary overview for the Enrollment Specialist.
CRITICAL: You are speaking to an Enrollment Specialist (ES). Never address the student directly.
CRITICAL: Your overview must be strictly between 180 and 350 characters.
CRITICAL: You MUST strictly interpret the "level" signals against the timeline. If the student's program start is MORE than 15 days out, "Low" readiness is completely normal early pipeline behavior (NOT highly at-risk) and should be described with an optimistic, guiding posture. Only if the program start is less than 15 days out should "Low" readiness be classified as a "significant/high risk candidate" requiring immediate attention.
{interaction_instruction}
CRITICAL: Do NOT embed explicit dates or timelines into the narrative summary.
CRITICAL: NEVER use robotic phrases like "and stable". Instead, explicitly explain the engagement level using the trend rule (e.g., "engagement is Low because there has been no interaction with the student for more than 7 days").
CRITICAL: Focus exclusively on concisely justifying why the student was assigned their explicit Readiness and Engagement statuses using the strict rules and trend notes provided below. You MUST format any action names seamlessly into Title Case (e.g. 'Wow Login', not 'wow_login').

Readiness Evaluation:
{json.dumps(readiness_context)}

Computed Engagement Metrics:
{json.dumps(engagement_level)}

Recent Activity Log:
{json.dumps(recent_activity_context)}

Computed Next Best Actions:
{json.dumps(nba_context)}

Reply ONLY in strictly valid JSON formatted exactly like this:
{{
  "overviewSummary": "Your synthesized paragraph goes here."
}}
        """
        
        try:
            raw = self._call_llm(prompt=prompt)
            if "overviewSummary" in raw:
                out["overviewSummary"] = raw["overviewSummary"]
        except Exception as exc:  # noqa: BLE001
            status = f"Summary generation failed: {exc}"
            out["overviewSummary"] = "System is actively calculating dynamic matrix summary values."

        end_t = datetime.datetime.now(datetime.timezone.utc)
        
        trace = AgentTrace(
            agentName=self.name,
            action=self.action,
            status=status,
            duration=f"{(end_t - start_t).total_seconds():.3f}s",
            timestamp=end_t.isoformat()
        )
        return AgentResult(output=out, trace=trace)

    def build_prompt(self, state: dict[str, Any], ctx: AccumulatedContext | None = None) -> str:
        return ""
    
    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        return {}
