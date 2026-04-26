"""NBA Agent — generates prioritised Next Best Actions for Enrollment Specialists.

Domain responsibility: recommend the most impactful actions the Enrollment
Specialist should take, grounded in the student's readiness and engagement
risk context accumulated by the orchestrator.

This agent operates purely deterministically! Generative AI generation
has been stripped in favor of absolute condition matching to eliminate hallucinations.
"""

from __future__ import annotations
import datetime
from typing import Any

from agents.base import AccumulatedContext, BaseAgent, AgentResult, AgentTrace


class NBAAgent(BaseAgent):
    """Generates a prioritised Next Best Actions list for the ES.

    Distinct from RiskAgent in that it is solely focused on translating
    the combined readiness + engagement risk context into concrete,
    actionable steps exactly aligned to the organizational CSV spreadsheet.
    """

    name: str = "NBA Agent"
    action: str = "Generate Next Best Actions"
    context_key: str = "nba"

    def run(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> AgentResult:
        """Override base run method to execute deterministically without Vertex AI."""
        start_t = datetime.datetime.now(datetime.timezone.utc)
        req = state.get("requirements", {})
        actions = []
        
        # Hard Rules strictly following the definition maps:
        if not req.get("initialPortalLogin", False):
            actions.append({
                "title": "Resolve missing: Initial portal login",
                "urgent": True,
                "points": [
                    "Link to student portal",
                    "Reserves email address",
                    "How to Log into Your Student Portal: https://youtu.be/ClgP0GtP2uQ",
                    "Estimated time to complete - 5 min"
                ],
                "buttonText": "Complete Task >"
            })
        start_str = state.get("programStartDate")
        try:
            start_date = datetime.datetime.fromisoformat(start_str.replace("Z", "+00:00")).replace(tzinfo=datetime.timezone.utc)
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            time_start = (start_date.date() - now_utc.date()).days
        except Exception:
            time_start = state.get("timeUntilClassStartDays", 0)

        if not req.get("fafsaSubmitted", False):
             actions.append({
                "title": "FAFSA Submission (or Alternative Funding)",
                "urgent": time_start <= 14,
                "points": [
                    "Walden Federal School Code: 025042",
                    "FAFSA Link: https://studentaid.gov/h/apply-for-aid/fafsa",
                    "Academic Year",
                    "How to Apply for Financial Aid: https://youtu.be/pimitLbiBoE",
                    "Estimated time to complete - 30 min"
                ],
                "buttonText": "Review Requirement"
             })
        if not req.get("courseRegistration", False):
             actions.append({
                "title": "Resolve missing: Course Registration",
                "urgent": True,
                "points": [
                    "New student: submit a case to get them registered for course",
                    "For returning student: need to work with SSA",
                    "Call student and figure out the intent",
                    "Link to register for courses"
                ],
                "buttonText": "Complete Task >"
             })
        if not req.get("wowOrientation", False):
             actions.append({
                "title": "Resolve missing: WOW Login",
                "urgent": False,
                "points": [
                    "Link to WOW orientation login",
                    "Estimated time to complete - 10 min"
                ],
                "buttonText": "Complete Task >"
             })
        start_str = state.get("programStartDate")
        if time_start <= 0:
            if not req.get("courseLogin", False):
                 actions.append({
                    "title": "Resolve missing: Logged into course",
                    "urgent": False,
                    "points": [
                        "Must log in to an accredited course",
                        "Link to canvas course",
                        "How to Access You Walden Orientation: https://youtu.be/67vGaf0uMEQ"
                    ],
                    "buttonText": "Review Requirement"
                 })
            if not req.get("classParticipation", False):
                 actions.append({
                    "title": "Resolve missing: Class participation",
                    "urgent": False,
                    "points": [
                        "Must participate in an accredited course",
                        "Link to canvas course",
                        "How to Access You Walden Orientation: https://youtu.be/67vGaf0uMEQ"
                    ],
                    "buttonText": "Review Requirement"
                 })
        if state.get("hasContingencies", False):
            if not req.get("officialTranscriptsReceived", False):
                 actions.append({
                    "title": "Contingency - official transcript",
                    "urgent": False,
                    "points": [
                        "School name",
                        "Link to school transcript request",
                        "Link for Walden to request TRF if applicable",
                        "Estimated time to complete - 10 min"
                    ],
                    "buttonText": "Review Requirement"
                 })
            if not req.get("nursingLicenseReceived", False):
                 actions.append({
                    "title": "Contingency - nursing license",
                    "urgent": False,
                    "points": [
                        "Instruction on where to submit nursing license",
                        "Estimated time to complete - 5 min"
                    ],
                    "buttonText": "Review Requirement"
                 })
             
        # Dynamically append Elective Activities from the CMS matrix to ensure the NBA list aggregates up to exactly 3 recommendations
        cms = state.get("cmsTemplates", [])
        electives = [c for c in cms if c.get("type", "") == "Elective Activity"]
        
        for e in electives:
            if len(actions) >= 3:
                break
            
            pts = []
            if e.get("nbaDisplay"): pts.append(e.get("nbaDisplay"))
            if e.get("talkingPoints"): pts.append(e.get("talkingPoints"))
            if e.get("emailLanguage"): pts.append(e.get("emailLanguage"))
            if not pts and e.get("content"): pts.append(e.get("content"))
            
            actions.append({
                "title": e.get("title", "Elective Activity"),
                "urgent": False,
                "points": pts,
                "buttonText": "Complete Task >"
            })
            
        # Fallback if 100% complete and no Electives exist natively in CMS
        if not actions:
             actions.append({
                "title": "No tasks required: Requirements Complete",
                "urgent": False,
                "points": ["No missing academic or onboarding requirements detected. Please check in periodically."],
                "buttonText": "Complete Task >"
             })
             
        out = {"nextBestActions": actions[:3]}
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
