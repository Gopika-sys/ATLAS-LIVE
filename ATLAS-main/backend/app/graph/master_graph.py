"""
ATLAS Master Graph — LangGraph orchestration
Triage → Parallel Agent Execution → Decision → Respond
All agents run concurrently. Memory augments every decision.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from langgraph.graph import StateGraph, END
from app.graph.state import AtlasState
from app.llm.clients import deep_reasoning, voice_synthesis
from app.agents.login_monitor_agent import LoginMonitorAgent
from app.agents.firewall_agent import FirewallAgent
from app.agents.incident_response_agent import IncidentResponseAgent
from app.agents.log_analysis_agent import LogAnalysisAgent
from app.agents.threat_intel_agent import ThreatIntelAgent
from app.agents.network_monitor_agent import NetworkMonitorAgent
from app.agents.malware_detection_agent import MalwareDetectionAgent
from app.agents.phishing_detection_agent import PhishingDetectionAgent
from app.agents.forensics_agent import ForensicsAgent
from app.agents.password_security_agent import PasswordSecurityAgent
from app.agents.insider_threat_agent import InsiderThreatAgent
from app.agents.report_generation_agent import ReportGenerationAgent
from app.agents.voice_assistant_agent import VoiceAssistantAgent
from app.agents.decision_making_agent import DecisionMakingAgent
from app.db.writer import insert_event, insert_incident, insert_agent_action, insert_decision_log
from app.memory.atlas_memory import store_incident_memory, recall_similar, get_threat_pattern, get_ip_pattern
from app.network.machine_profile import get_agent_context_header
from app.actions.executor import execute_actions
import socket
import json
import re

MY_HOSTNAME = socket.gethostname()

AGENTS = {
    "login_monitor":      LoginMonitorAgent(),
    "firewall":           FirewallAgent(),
    "incident_response":  IncidentResponseAgent(),
    "log_analysis":       LogAnalysisAgent(),
    "threat_intel":       ThreatIntelAgent(),
    "network_monitor":    NetworkMonitorAgent(),
    "malware_detection":  MalwareDetectionAgent(),
    "phishing_detection": PhishingDetectionAgent(),
    "forensics":          ForensicsAgent(),
    "password_security":  PasswordSecurityAgent(),
    "insider_threat":     InsiderThreatAgent(),
    "report_generation":  ReportGenerationAgent(),
    "voice_assistant":    VoiceAssistantAgent(),
    "decision_making":    DecisionMakingAgent(),
}

HIGH_RISK_ACTIONS = {
    "block_ip", "lock_account", "isolate_machine",
    "quarantine_file", "disable_session", "force_reset",
}

EVENT_AGENT_MAP = {
    "brute_force":          ["login_monitor", "firewall", "threat_intel"],
    "port_scan":            ["network_monitor", "firewall", "threat_intel"],
    "ddos":                 ["network_monitor", "firewall", "log_analysis"],
    "sql_injection":        ["firewall", "log_analysis", "threat_intel"],
    "phishing":             ["phishing_detection", "threat_intel", "log_analysis"],
    "malware":              ["malware_detection", "forensics", "incident_response"],
    "xss":                  ["firewall", "log_analysis", "threat_intel"],
    "reverse_shell":        ["network_monitor", "malware_detection", "forensics"],
    "privilege_escalation": ["incident_response", "forensics", "log_analysis"],
    "insider_threat":       ["login_monitor", "insider_threat", "log_analysis"],
    "data_exfiltration":    ["network_monitor", "insider_threat", "forensics"],
    "weak_password":        ["password_security", "login_monitor"],
    "security_posture":     ["password_security", "firewall", "log_analysis"],
}


def triage_node(state: AtlasState) -> AtlasState:
    event = state["event"]
    try:
        insert_event(event)
    except Exception:
        pass

    etype = event.get("type", "normal")

    # Agent selection is LOCKED to EVENT_AGENT_MAP — never let LLM override this.
    # This prevents the LLM from routing e.g. a posture event to phishing_detection
    # which would then hallucinate fake source IPs and create false incidents.
    selected_agents = EVENT_AGENT_MAP.get(etype, ["log_analysis", "threat_intel"])

    # Memory context for severity escalation only
    past = recall_similar(event, limit=2)
    pattern = get_threat_pattern(etype)
    ip_pattern = get_ip_pattern(event.get("source_ip", ""))

    # Use scored severity from event — LLM can only escalate, never change type
    severity = event.get("severity", "medium")
    if pattern.get("is_recurring") and severity in ("low", "medium"):
        severity = "high"
    # Repeat offender IP — always escalate to high minimum
    if ip_pattern.get("is_repeat_offender") and severity in ("low", "medium"):
        severity = "high"

    state["triage_result"]  = {"severity": severity, "agents": selected_agents, "reasoning": "rule-based"}
    state["selected_agents"] = selected_agents[:6]
    state["memory_context"]  = past
    state["ip_pattern"]      = ip_pattern

    # Build incident title strictly from real event fields — never from LLM output
    subtype = event.get("subtype", "")
    process = event.get("process", "")
    user    = event.get("user") or event.get("target_user", "")
    src_ip  = event.get("source_ip", MY_HOSTNAME)

    # For local-machine events use hostname, not a random IP
    is_local = src_ip in (MY_HOSTNAME, "unknown") or src_ip.startswith("172.17.")

    if subtype:
        title = f"{subtype.replace('_', ' ').title()} on {MY_HOSTNAME}"
    elif user and user not in ("unknown", ""):
        title = f"{etype.replace('_', ' ').title()} — user: {user} on {MY_HOSTNAME}"
    elif process and process not in ("unknown", ""):
        title = f"{etype.replace('_', ' ').title()} — {process} on {MY_HOSTNAME}"
    elif is_local:
        title = f"{etype.replace('_', ' ').title()} on {MY_HOSTNAME}"
    else:
        title = f"{etype.replace('_', ' ').title()} from {src_ip}"

    try:
        incident = insert_incident(title=title, severity=severity)
        state["incident_id"] = incident.data[0]["id"] if incident.data else None
    except Exception:
        state["incident_id"] = None

    return state


def _run_agent(agent_name: str, event: dict, memory_context: list) -> tuple[str, dict]:
    agent = AGENTS.get(agent_name)
    if not agent:
        return agent_name, {"action": "skipped", "reasoning": "Agent not found", "severity": "low"}
    # Inject memory into event context for the agent
    ctx = dict(event)
    if memory_context:
        ctx["_memory"] = [
            {"event_type": m.get("event_type"), "past_action": m.get("agent_results_summary", {}).get(agent_name, {}).get("action")}
            for m in memory_context
        ]
    try:
        return agent_name, agent.run(ctx)
    except Exception as e:
        return agent_name, {"action": "error", "reasoning": str(e), "severity": "low"}


def agent_execution_node(state: AtlasState) -> AtlasState:
    """Run all selected agents in parallel using ThreadPoolExecutor."""
    results = {}
    memory_ctx = state.get("memory_context", [])

    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {
            executor.submit(_run_agent, name, state["event"], memory_ctx): name
            for name in state["selected_agents"]
        }
        for future in as_completed(futures):
            agent_name, result = future.result()
            results[agent_name] = result
            try:
                insert_agent_action(
                    incident_id=state["incident_id"],
                    agent_name=agent_name,
                    action=result.get("action", "unknown"),
                    params=result,
                )
            except Exception:
                pass

    state["agent_results"] = results
    state["requires_approval"] = any(r.get("action") in HIGH_RISK_ACTIONS for r in results.values())
    return state


def _decision_system() -> str:
    return get_agent_context_header() + """
You are the ATLAS Decision Making AI protecting the machine above.
You receive findings from multiple specialized security agents. Your job:
1. Synthesize all findings into a unified threat assessment for THIS specific machine
2. Reference the machine's open ports, users, and firewall status in your reasoning
3. Decide which actions to execute immediately vs which need human approval
4. Provide clear reasoning referencing the actual machine hostname and IP

High-risk actions requiring approval: block_ip, lock_account, isolate_machine, quarantine_file, disable_session, force_reset

Respond ONLY with valid JSON:
{
  "action": "execute|escalate|resolve",
  "reasoning": "...",
  "severity": "low|medium|high|critical",
  "approved_actions": [],
  "pending_approval": [],
  "overall_threat": "low|medium|high|critical",
  "recommendations": ["..."]
}"""


def decision_node(state: AtlasState) -> AtlasState:
    payload = {
        "event": state["event"],
        "agent_results": state["agent_results"],
        "memory_context": state.get("memory_context", []),
    }
    raw = deep_reasoning(
        f"Agent findings:\n{json.dumps(payload, indent=2)}\n\nMake the final coordinated decision.",
        system=_decision_system(),
    )
    cleaned = re.sub(r"```(?:json)?", "", raw).strip()
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    try:
        result = json.loads(match.group() if match else cleaned)
    except (json.JSONDecodeError, AttributeError):
        result = {
            "action": "execute",
            "approved_actions": [],
            "pending_approval": [],
            "overall_threat": state["event"].get("severity", "medium"),
            "recommendations": [],
            "reasoning": "Decision engine fallback.",
        }

    state["approved_actions"] = result.get("approved_actions", [])
    state["pending_approval"] = result.get("pending_approval", [])
    state["overall_threat"] = result.get("overall_threat", "medium")
    state["requires_approval"] = len(state["pending_approval"]) > 0
    state["recommendations"] = result.get("recommendations", [])
    state["decision_reasoning"] = result.get("reasoning", "")

    # Memory feedback: repeat offender IP → auto-promote pending to approved, skip human approval
    ip_pattern = state.get("ip_pattern", {})
    if ip_pattern.get("is_repeat_offender") and state["pending_approval"]:
        times = ip_pattern["times_seen"]
        state["approved_actions"] = state["approved_actions"] + state["pending_approval"]
        state["pending_approval"] = []
        state["requires_approval"] = False
        state["decision_reasoning"] += f" [AUTO-EXECUTE: repeat offender IP seen {times}x in memory — skipping approval.]"

    return state


def respond_node(state: AtlasState) -> AtlasState:
    event = state["event"]
    agent_results = state["agent_results"]
    decision_reasoning = state.get("decision_reasoning", "")
    pending = state.get("pending_approval", [])
    recommendations = state.get("recommendations", [])

    # Execute approved actions on the real machine
    approved = state.get("approved_actions", [])
    execution_outcomes = []
    if approved:
        execution_outcomes = execute_actions(approved, event, agent_results)
        executed_ok  = [o["action"] for o in execution_outcomes if o.get("success")]
        executed_fail = [o["action"] for o in execution_outcomes if not o.get("success")]
        if executed_ok:
            decision_reasoning += f" Executed: {', '.join(executed_ok)}."
        if executed_fail:
            decision_reasoning += f" Failed (needs admin): {', '.join(executed_fail)}."

    # Build rich final response
    parts = [decision_reasoning]
    if pending:
        parts.append(f"Awaiting administrator approval for: {', '.join(pending)}.")
    if recommendations:
        parts.append(f"Recommendations: {'; '.join(recommendations[:2])}.")
    final_response = " ".join(filter(None, parts)) or "Incident processed. No further action required."

    state["final_response"] = final_response

    # JARVIS-style spoken response via NVIDIA NIM
    voice_prompt = (
        f"Security event: {event.get('type', 'unknown')} from {event.get('source_ip', 'unknown')}. "
        f"Severity: {state.get('overall_threat', 'medium')}. "
        f"Summary: {decision_reasoning[:300]}"
    )
    if state.get("voice_query"):
        voice_prompt = f"Operator asked: '{state['voice_query']}'. {voice_prompt}"

    try:
        state["spoken_response"] = voice_synthesis(voice_prompt)
    except Exception:
        state["spoken_response"] = final_response

    # Persist decision + store in memory
    try:
        insert_decision_log(
            incident_id=state["incident_id"],
            reasoning_text=final_response,
            plan_json={
                "agent_results": agent_results,
                "approved_actions": state["approved_actions"],
                "pending_approval": state["pending_approval"],
                "recommendations": recommendations,
                "execution_outcomes": execution_outcomes,
            },
        )
    except Exception:
        pass

    try:
        store_incident_memory(
            event=event,
            agent_results=agent_results,
            final_response=final_response,
            incident_id=state["incident_id"],
        )
    except Exception:
        pass

    return state


def build_graph():
    graph = StateGraph(AtlasState)
    graph.add_node("triage", triage_node)
    graph.add_node("execute", agent_execution_node)
    graph.add_node("decide", decision_node)
    graph.add_node("respond", respond_node)

    graph.set_entry_point("triage")
    graph.add_edge("triage", "execute")
    graph.add_edge("execute", "decide")
    graph.add_edge("decide", "respond")
    graph.add_edge("respond", END)

    return graph.compile()


atlas_graph = build_graph()


def run_atlas(event: dict, voice_query: str = "") -> dict:
    initial_state: AtlasState = {
        "event": event,
        "triage_result": None,
        "selected_agents": [],
        "agent_results": {},
        "incident_id": None,
        "final_response": None,
        "spoken_response": None,
        "requires_approval": False,
        "approved": False,
        "approved_actions": [],
        "pending_approval": [],
        "overall_threat": None,
        "voice_query": voice_query,
        "memory_context": [],
        "recommendations": [],
        "decision_reasoning": "",
        "ip_pattern": {},
    }
    return atlas_graph.invoke(initial_state)
