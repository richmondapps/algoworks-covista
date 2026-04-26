import json
import datetime
from agents.readiness_agent import ReadinessAgent
from orchestration.orchestrator import AgentOrchestrator
from agents.nba_agent import NBAAgent

state = {
    "studentUid": "A01304605",
    "programStartDate": "2026-05-25",
    "reserveDate": "2026-04-06",
    "requirements": {
        "fafsaSubmitted": False,
        "courseRegistration": True
    }
}

agent = ReadinessAgent()
res = agent.run(state)
print("Readiness Agent Output:", res)

nba = NBAAgent()
nba_res = nba.run(state)
print("NBA Agent Output:", nba_res)
