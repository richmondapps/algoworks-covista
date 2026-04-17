"""Base agent abstraction for the Covista student-state AI pipeline.

Defines the BaseAgent ABC, the AccumulatedContext value object, and the
shared AgentResult / AgentTrace dicts that every concrete agent must
produce.  No Firestore, Flask, or HTTP dependencies are allowed in this
module (Clean Architecture — domain layer only).
"""

from __future__ import annotations

import datetime
import json
import time
from abc import ABC, abstractmethod
from typing import Any, TypedDict

from vertexai.preview.generative_models import GenerativeModel


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------

class AgentTrace(dict):
    """Execution trace entry produced by a single agent run.

    Treated as a plain dict so it serialises directly to JSON without
    extra conversion.  All fields are always present.

    Fields:
        agentName: Human-readable name of the agent (e.g. "Readiness Agent").
        action: Short description of the task performed.
        status: "Success" or "Failed: <message>".
        duration: Wall-clock time formatted as "N.Ns".
        timestamp: ISO-8601 UTC timestamp of when the run completed.
    """


class AgentResult(dict):
    """Envelope returned by every BaseAgent.run() call.

    Treated as a plain dict so orchestrators can merge results without
    conversion.

    Fields:
        output: Domain-specific structured output.  Empty dict on failure.
        trace: AgentTrace for this run, always populated.
    """


class AccumulatedContext(TypedDict, total=False):
    """Read-only accumulated outputs passed forward through the pipeline.

    The orchestrator populates this dict incrementally as each agent
    completes, then passes it alongside the original student state to the
    next agent.  Agents read from it; they never write to it.

    Fields:
        readiness: Output of ReadinessAgent (readinessRisk + metrics).
        risk: Output of RiskAgent (engagementRisk + overviewSummary).
        nba: Output of NBAAgent (nextBestActions).
        communications: Output of CommunicationsAgent (emailDraft + smsDraft).
    """

    readiness: dict[str, Any]
    risk: dict[str, Any]
    nba: dict[str, Any]
    communications: dict[str, Any]


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class BaseAgent(ABC):
    """Abstract base for all student-state AI agents.

    Subclasses implement build_prompt() and parse_output() to define
    domain-specific behaviour.  The orchestration loop (prompt → LLM →
    parse → trace) is provided by the template method run().

    Design constraints (enforced by this class):
    - Accepts raw student state as a plain dict; returns AgentResult.
    - Does NOT call other agents.
    - Does NOT write to Firestore or any external system.
    - LLM interaction is isolated in _call_llm() for easy mocking.

    Class Attributes:
        name: Display name used in AgentTrace entries.
        action: Short label for the task, used in AgentTrace entries.
        model_name: Vertex AI model identifier.
        context_key: Key under which this agent's output is stored in
            AccumulatedContext by the orchestrator.  Empty string means
            the agent's output is not accumulated (e.g. a terminal agent).
    """

    name: str = "BaseAgent"
    action: str = "Unknown Action"
    model_name: str = "gemini-2.5-flash"
    context_key: str = ""

    # ------------------------------------------------------------------
    # Abstract interface — subclasses must implement both methods
    # ------------------------------------------------------------------

    @abstractmethod
    def build_prompt(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> str:
        """Construct the LLM prompt from the current student state.

        Args:
            state: Full Firestore document for the student, mirroring
                the salesforce_opportunities/{student_id} shape.
            ctx: Accumulated outputs from agents that ran before this
                one.  None when no prior agent has run (e.g. Readiness
                Agent).  Agents should treat this as read-only.

        Returns:
            Prompt string to send to the LLM.
        """
        ...

    @abstractmethod
    def parse_output(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Transform and validate raw LLM JSON into domain output.

        Implementations should return an empty dict rather than raising
        when the payload is missing expected keys, so that run() can
        record a partial failure in the trace without crashing.

        Args:
            raw: Parsed JSON object returned by _call_llm().

        Returns:
            Domain-specific output dict.  Empty dict when validation
            fails or required keys are absent.
        """
        ...

    # ------------------------------------------------------------------
    # LLM integration — isolated for testability
    # ------------------------------------------------------------------

    def _call_llm(self, prompt: str) -> dict[str, Any]:
        """Call Vertex AI Gemini and return the parsed JSON response.

        Isolated as a regular method so unit tests can replace it via
        unittest.mock.patch without requiring a live GCP connection.

        Args:
            prompt: Fully-rendered prompt string to send to the model.

        Returns:
            Parsed JSON object from the model response.

        Raises:
            json.JSONDecodeError: When the model returns non-JSON text.
            Exception: Propagates any Vertex AI SDK errors.
        """
        model = GenerativeModel(model_name=self.model_name)
        response = model.generate_content(
            prompt,
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.2,
            },
        )
        cleaned = response.text.replace("```json", "").replace("```", "")
        return json.loads(cleaned.strip())

    # ------------------------------------------------------------------
    # Template method — not overridden by subclasses
    # ------------------------------------------------------------------

    def run(
        self,
        state: dict[str, Any],
        ctx: AccumulatedContext | None = None,
    ) -> AgentResult:
        """Execute the agent and return a result envelope with trace.

        Template method that orchestrates: build_prompt → _call_llm →
        parse_output.  Catches all exceptions to guarantee a populated
        AgentTrace is always returned, even on failure.

        Args:
            state: Full student Firestore document.
            ctx: Accumulated outputs from agents that ran before this
                one.  Passed through to build_prompt().  Defaults to
                None so existing callers without context continue to
                work unchanged.

        Returns:
            AgentResult with:
                output — domain-specific dict, empty on failure.
                trace  — AgentTrace recording name, status, duration,
                         and UTC timestamp of this run.
        """
        start: float = time.time()
        status: str = "Success"
        output: dict[str, Any] = {}

        try:
            prompt = self.build_prompt(state=state, ctx=ctx)
            raw = self._call_llm(prompt=prompt)
            output = self.parse_output(raw=raw)
        except Exception as exc:  # noqa: BLE001
            status = f"Failed: {exc}"
            print(f"[{self.name}] Error during run: {exc}")

        duration = f"{time.time() - start:.1f}s"

        return AgentResult(
            output=output,
            trace=AgentTrace(
                agentName=self.name,
                action=self.action,
                status=status,
                duration=duration,
                timestamp=datetime.datetime.now(
                    tz=datetime.timezone.utc
                ).isoformat(),
            ),
        )
