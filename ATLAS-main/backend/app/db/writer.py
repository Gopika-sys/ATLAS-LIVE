import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)


def insert_event(event: dict):
    return supabase.table("events").insert({
        "source":      event.get("source_ip", "unknown"),
        "type":        event["type"],
        "raw_payload": event,
        "severity":    event.get("severity", "low"),
        "status":      "new",
        # Store the capture source so we can filter real vs fake
        "collector":   event.get("source", "unknown"),
    }).execute()


def insert_incident(title: str, severity: str):
    return supabase.table("incidents").insert({
        "title":       title,
        "severity":    severity,
        "status":      "open",
        "data_source": "real_capture",   # tag so we can filter fake/old incidents
    }).execute()


def insert_agent_action(incident_id, agent_name, action, params, approved_by=None):
    enriched = dict(params) if params else {}
    # Always tag with real_capture so frontend can verify data origin
    enriched["data_source"] = "real_capture"
    # Extract the most useful display field for the UI
    enriched["display_target"] = (
        enriched.get("target_ip") or
        enriched.get("target_user") or
        enriched.get("affected_user") or
        enriched.get("suspect_user") or
        enriched.get("indicator") or
        enriched.get("affected_service") or
        enriched.get("file_path") or
        enriched.get("source_ip") or
        ""
    )
    return supabase.table("agent_actions").insert({
        "incident_id": incident_id,
        "agent_name":  agent_name,
        "action":      action,
        "params":      enriched,
        "approved_by": approved_by,
    }).execute()


def insert_decision_log(incident_id, reasoning_text, plan_json):
    return supabase.table("decision_log").insert({
        "incident_id":    incident_id,
        "reasoning_text": reasoning_text,
        "plan_json":      plan_json,
    }).execute()


def insert_voice_history(transcribed: str, response_text: str):
    return supabase.table("voice_history").insert({
        "transcribed":   transcribed,
        "response_text": response_text,
    }).execute()
