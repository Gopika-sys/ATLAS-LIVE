"""
ATLAS Memory System
Stores incident fingerprints and retrieves similar past incidents
so agents can reason with historical context — ATLAS learns over time.
"""
import json
import hashlib
from app.db.writer import supabase

_REPEAT_OFFENDER_THRESHOLD = 3   # configurable via /settings/repeat-offender-threshold


def _fingerprint(event: dict) -> str:
    key = f"{event.get('type', '')}:{event.get('severity', '')}:{event.get('source_ip', '')[:8] if event.get('source_ip') else ''}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def store_incident_memory(event: dict, agent_results: dict, final_response: str, incident_id: str = None):
    try:
        supabase.table("atlas_memory").insert({
            "fingerprint": _fingerprint(event),
            "event_type": event.get("type", "unknown"),
            "severity": event.get("severity", "low"),
            "source_ip": event.get("source_ip"),
            "agent_results_summary": {
                k: {"action": v.get("action"), "severity": v.get("severity")}
                for k, v in agent_results.items()
            },
            "final_response": final_response,
            "incident_id": incident_id,
        }).execute()
    except Exception:
        pass


def recall_similar(event: dict, limit: int = 3) -> list[dict]:
    """Retrieve past incidents of the same type to give agents historical context."""
    try:
        result = supabase.table("atlas_memory") \
            .select("event_type, severity, agent_results_summary, final_response, created_at") \
            .eq("event_type", event.get("type", "unknown")) \
            .order("created_at", desc=True) \
            .limit(limit) \
            .execute()
        return result.data or []
    except Exception:
        return []


def get_threat_pattern(event_type: str) -> dict:
    """Aggregate stats: how many times seen, most common severity, most common action."""
    try:
        result = supabase.table("atlas_memory") \
            .select("severity, agent_results_summary") \
            .eq("event_type", event_type) \
            .execute()
        rows = result.data or []
        if not rows:
            return {}
        severities = [r["severity"] for r in rows]
        most_common_sev = max(set(severities), key=severities.count)
        return {
            "times_seen": len(rows),
            "most_common_severity": most_common_sev,
            "is_recurring": len(rows) >= 3,
        }
    except Exception:
        return {}


def get_ip_pattern(source_ip: str) -> dict:
    """
    Check how many times this specific IP has appeared in memory.
    Returns is_repeat_offender=True if seen 3+ times — triggers auto-execute.
    """
    if not source_ip or source_ip in ("unknown", "external", ""):
        return {"times_seen": 0, "is_repeat_offender": False}
    try:
        result = supabase.table("atlas_memory") \
            .select("event_type, severity") \
            .eq("source_ip", source_ip) \
            .execute()
        rows = result.data or []
        return {
            "times_seen":          len(rows),
            "is_repeat_offender":  len(rows) >= _REPEAT_OFFENDER_THRESHOLD,
            "event_types_seen":    list({r["event_type"] for r in rows}),
        }
    except Exception:
        return {"times_seen": 0, "is_repeat_offender": False}
