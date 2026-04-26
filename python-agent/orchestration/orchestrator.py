"""Orchestration layer — coordinates AI agents in a defined pipeline sequence.

Infrastructure responsibility: execute domain agents in order, accumulate
their outputs into a shared context, isolate failures, and assemble the
final DerivedOutput matching the canonical ai_insights/latest Firestore schema.

Architecture rules enforced here:
- No agent calls another agent.  Context flows forward only via AccumulatedContext.
- The orchestrator never writes to Firestore (that is the Flask route's job).
- One agent failing does NOT halt downstream agents (AC 4).
"""

from __future__ import annotations

import datetime
from collections.abc import Sequence
from typing import Any, Mapping, TypedDict, cast

from agents.base import AccumulatedContext, BaseAgent


# ---------------------------------------------------------------------------
# Output contract — mirrors docs/student-state-schema.json
#   salesforce_opportunities/{student_id}/ai_insights/latest
# ---------------------------------------------------------------------------

class DerivedOutput(TypedDict, total=False):
    """Complete AI-generated payload written to ai_insights/latest.

    Key set mirrors the ai_insights/latest document schema defined in
    docs/student-state-schema.json exactly.  total=False allows partial
    results when some agents fail — callers should check for key presence
    rather than assuming all fields are populated.

    Fields:
        overviewSummary: Holistic narrative for the ES (Risk Agent).
        readinessRisk: Readiness risk level, trend, and note.
        engagementRisk: Engagement risk level, trend, and note.
        metrics: Timing metrics (timeSinceReserve, etc.).
        nextBestActions: Prioritised action list (NBA Agent).
        emailDraft: Email body and bullets (Communications Agent).
        smsDraft: SMS text ≤ 140 chars (Communications Agent).
        agentTrace: Execution trace of all agents for observability.
        generatedAt: ISO-8601 UTC timestamp of pipeline completion.
    """

    overviewSummary: str
    readinessRisk: dict[str, Any]
    engagementRisk: dict[str, Any]
    metrics: dict[str, Any]
    nextBestActions: list[dict[str, Any]]
    emailDraft: dict[str, Any]
    smsDraft: str
    agentTrace: list[dict[str, Any]]
    generatedAt: str


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class AgentOrchestrator:
    """Executes a sequence of agents and assembles their outputs.

    The pipeline iterates agents in the order supplied at construction,
    passes the original student state plus an incrementally accumulated
    context to each agent, and continues even when an agent fails (AC 4).

    Dependency injection via the constructor allows tests to substitute
    mock agents or reorder the pipeline without touching production code.

    Args:
        agents: Ordered sequence of agents to run.  In production:
            [ReadinessAgent, RiskAgent, NBAAgent, CommunicationsAgent].
    """

    def __init__(self, agents: Sequence[BaseAgent]) -> None:
        """Initialise the orchestrator with an ordered agent sequence.

        Args:
            agents: Sequence of agents to execute in order.
        """
        self._agents: Sequence[BaseAgent] = agents

    def run(self, *, state: Mapping[str, Any]) -> DerivedOutput:
        """Execute the full agent pipeline and return a DerivedOutput.

        Each agent receives the original student state plus accumulated
        outputs from all preceding agents via AccumulatedContext.  The
        context is never passed back to completed agents and agents
        never write to it directly — only this method mutates it after
        each agent completes.

        If an agent fails (raises internally, returns empty output + a
        "Failed:" trace), the orchestrator logs the failure via the trace,
        continues to the next agent, and includes the failed trace in the
        final result.

        Args:
            state: Full student Firestore document.  Accepted as a
                Mapping to signal that the orchestrator does not modify
                the caller's dict.

        Returns:
            DerivedOutput assembled from all agent outputs, plus
            agentTrace and generatedAt metadata.  Keys are absent when
            the corresponding agent failed.
        """
        ctx: AccumulatedContext = AccumulatedContext()
        traces: list[dict[str, Any]] = []
        merged_outputs: dict[str, Any] = {}

        # Convert to a plain dict once so all agents receive a consistent type.
        state_dict: dict[str, Any] = dict(state)
        
        # Absolute Calculation: Force overwrite the stale BQ timeSinceReserveDays using true active dates
        if state_dict.get("reserveDate"):
            try:
                r_date = datetime.datetime.strptime(state_dict["reserveDate"], "%Y-%m-%d").date()
                
                ui_date_str = state_dict.get("uiCalculatedDateStr")
                if ui_date_str:
                    now_local = datetime.datetime.strptime(ui_date_str, "%Y-%m-%d").date()
                else:
                    now_local = datetime.datetime.now(datetime.timezone.utc).date()
                    
                delta = (now_local - r_date).days
                state_dict["timeSinceReserveDays"] = max(0, delta)
            except Exception:
                pass

        for agent in self._agents:
            result = agent.run(state=state_dict, ctx=ctx)
            traces.append(result["trace"])

            if result["output"] and agent.context_key:
                ctx[agent.context_key] = result["output"]  # type: ignore[literal-required]
                merged_outputs.update(result["output"])

        derived: dict[str, Any] = {
            **merged_outputs,
            "agentTrace": traces,
            "generatedAt": datetime.datetime.now(
                tz=datetime.timezone.utc
            ).isoformat(),
        }
        return cast(DerivedOutput, derived)
