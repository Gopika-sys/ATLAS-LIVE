from typing import TypedDict, List, Optional


class AtlasState(TypedDict):
    event: dict
    triage_result: Optional[dict]
    selected_agents: List[str]
    agent_results: dict
    incident_id: Optional[str]
    final_response: Optional[str]
    spoken_response: Optional[str]
    requires_approval: bool
    approved: bool
    approved_actions: List[str]
    pending_approval: List[str]
    overall_threat: Optional[str]
    voice_query: Optional[str]
    memory_context: List[dict]
    recommendations: List[str]
    decision_reasoning: str
    ip_pattern: dict
