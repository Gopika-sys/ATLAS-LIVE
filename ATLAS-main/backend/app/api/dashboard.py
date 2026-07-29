import socket
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.db.writer import supabase
from app.db.archive import archive_records, get_archived_incidents, list_archived_hostnames
from app.network.machine_profile import get_profile
from app.actions.executor import execute_actions
from datetime import datetime, timedelta, timezone

_MY_HOSTNAME = socket.gethostname()

router = APIRouter()


def _safe(fn):
    try:
        return fn()
    except Exception:
        return []


@router.get("/dashboard-state")
def dashboard_state():
    try:
        events    = (supabase.table("events")
                     .select("*")
                     .order("ts", desc=True)
                     .limit(100)
                     .execute())
        incidents = (supabase.table("incidents")
                     .select("*")
                     .eq("data_source", "real_capture")
                     .like("title", f"%{_MY_HOSTNAME}%")
                     .order("created_at", desc=True)
                     .limit(50)
                     .execute())
        # Only real_capture agent actions
        actions   = (supabase.table("agent_actions")
                     .select("*")
                     .order("ts", desc=True)
                     .limit(100)
                     .execute())
        decisions = (supabase.table("decision_log")
                     .select("*")
                     .order("ts", desc=True)
                     .limit(100)
                     .execute())
    except Exception as e:
        return JSONResponse(status_code=503, content={
            "error": str(e),
            "events": [], "incidents": [], "agent_actions": [], "decision_log": [],
            "threat_level": "low", "security_score": 100,
            "stats": {}, "blocked_ips": [], "voice_history": [],
            "recommendations": [], "pending_approvals": [],
        })

    # Filter: only actions tagged as real_capture
    real_actions = [
        a for a in actions.data
        if isinstance(a.get("params"), dict)
        and a["params"].get("data_source") == "real_capture"
    ]

    # Filter: only events from real capture (not simulation_fallback)
    real_events = [
        e for e in events.data
        if e.get("collector") != "simulation_fallback"
        and e.get("raw_payload", {}).get("source") != "simulation_fallback"
    ]

    # Filter decision log: only entries whose reasoning mentions THIS machine
    # or whose incident_id belongs to this machine's incidents
    my_incident_ids = {i["id"] for i in incidents.data}
    decisions_filtered = [
        d for d in decisions.data
        if (d.get("incident_id") in my_incident_ids)
        or (_MY_HOSTNAME in (d.get("reasoning_text") or ""))
    ][:20]

    open_incidents = [i for i in incidents.data if i.get("status") == "open"]
    threat_level = (
        "critical" if any(i["severity"] == "critical" for i in open_incidents)
        else "high"   if any(i["severity"] == "high"     for i in open_incidents)
        else "medium" if open_incidents
        else "low"
    )

    critical_count = sum(1 for i in open_incidents if i["severity"] == "critical")
    high_count     = sum(1 for i in open_incidents if i["severity"] == "high")
    medium_count   = sum(1 for i in open_incidents if i["severity"] == "medium")
    penalty        = (critical_count * 15) + (high_count * 8) + (medium_count * 3)
    security_score = max(20, 100 - penalty)

    type_counts: dict = {}
    for e in real_events:
        t = e.get("type", "unknown")
        type_counts[t] = type_counts.get(t, 0) + 1

    blocked_ips = _safe(lambda: supabase.table("agent_actions")
        .select("agent_name, action, params, ts")
        .eq("action", "block_ip")
        .order("ts", desc=True)
        .limit(20)
        .execute().data)
    # Filter blocked_ips to real only
    blocked_ips = [
        b for b in blocked_ips
        if isinstance(b.get("params"), dict)
        and b["params"].get("data_source") == "real_capture"
    ]

    voice_history = _safe(lambda: supabase.table("voice_history")
        .select("*")
        .order("ts", desc=True)
        .limit(20)
        .execute().data)

    recommendations = []
    for d in decisions_filtered[:5]:
        plan = d.get("plan_json", {})
        if isinstance(plan, dict):
            recommendations.extend(plan.get("recommendations", []))
    recommendations = list(dict.fromkeys(recommendations))[:6]

    pending_approvals = []
    for d in decisions_filtered[:10]:
        plan = d.get("plan_json", {})
        if isinstance(plan, dict) and plan.get("pending_approval"):
            pending_approvals.append({
                "incident_id":    d.get("incident_id"),
                "pending_actions": plan["pending_approval"],
                "ts":             d.get("ts"),
            })

    severity_counts = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for i in incidents.data:
        sev = i.get("severity", "low")
        if sev in severity_counts:
            severity_counts[sev] += 1

    memory_stats = _safe(lambda: supabase.table("atlas_memory")
        .select("event_type").execute().data)
    memory_type_counts: dict = {}
    for m in memory_stats:
        t = m.get("event_type", "unknown")
        memory_type_counts[t] = memory_type_counts.get(t, 0) + 1

    return {
        "threat_level":      threat_level,
        "security_score":    security_score,
        "events":            real_events,
        "incidents":         incidents.data,
        "agent_actions":     real_actions,
        "decision_log":      decisions_filtered,
        "blocked_ips":       blocked_ips,
        "voice_history":     voice_history,
        "recommendations":   recommendations,
        "pending_approvals": pending_approvals,
        "stats": {
            "total_incidents":   len(incidents.data),
            "open_incidents":    len(open_incidents),
            "total_events":      len(real_events),
            "event_type_counts": type_counts,
            "severity_counts":   severity_counts,
            "agents_active":     len(set(
                a.get("agent_name") for a in real_actions
                if a.get("ts") and (datetime.now(timezone.utc) - datetime.fromisoformat(a["ts"].replace("Z","+00:00"))).total_seconds() < 86400
            )),
            "memory_incidents":  len(memory_stats),
            "recurring_threats": {k: v for k, v in memory_type_counts.items() if v >= 3},
        },
    }


@router.get("/agents/{agent_name}/detail")
def agent_detail(agent_name: str):
    """Full detail for one agent — only this machine's incidents and actions."""
    try:
        # First get this machine's incident IDs
        my_inc_rows = (supabase.table("incidents")
                       .select("id")
                       .eq("data_source", "real_capture")
                       .like("title", f"%{_MY_HOSTNAME}%")
                       .execute().data or [])
        my_inc_ids = {r["id"] for r in my_inc_rows}

        actions = (supabase.table("agent_actions")
                   .select("*")
                   .eq("agent_name", agent_name)
                   .order("ts", desc=True)
                   .limit(200)
                   .execute())
        # Only real_capture actions AND only for this machine's incidents
        real = [
            a for a in actions.data
            if isinstance(a.get("params"), dict)
            and a["params"].get("data_source") == "real_capture"
            and (a.get("incident_id") in my_inc_ids or a.get("incident_id") is None)
        ]
        incident_ids = list({a["incident_id"] for a in real if a.get("incident_id")})
        incidents = []
        if incident_ids:
            all_inc = (supabase.table("incidents")
                       .select("*")
                       .in_("id", incident_ids[:50])
                       .execute().data or [])
            incidents = [i for i in all_inc
                         if _MY_HOSTNAME in (i.get("title") or "")]
        return {"agent_name": agent_name, "actions": real, "incidents": incidents}
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})


@router.delete("/incidents/clear-all")
def clear_all_incidents():
    """Wipe all data — deletes in FK-safe order."""
    try:
        supabase.table("atlas_memory").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("decision_log").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("agent_actions").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("incidents").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("events").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        supabase.table("voice_history").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        return {"status": "cleared"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/incidents/purge-foreign")
def purge_foreign_incidents():
    """
    Delete all incidents, agent_actions, decision_log, and memory entries
    that do NOT belong to this machine (_MY_HOSTNAME).
    Safe to run — only removes rows where title does NOT contain this hostname.
    """
    try:
        all_inc = supabase.table("incidents").select("id, title").execute().data or []
        foreign_ids = [
            i["id"] for i in all_inc
            if _MY_HOSTNAME not in (i.get("title") or "")
        ]
        if not foreign_ids:
            return {"status": "nothing_to_purge", "removed": 0, "kept_for": _MY_HOSTNAME}

        # Delete in FK-safe order, in chunks of 50
        for i in range(0, len(foreign_ids), 50):
            batch = foreign_ids[i:i + 50]
            supabase.table("atlas_memory").delete().in_("incident_id", batch).execute()
            supabase.table("decision_log").delete().in_("incident_id", batch).execute()
            supabase.table("agent_actions").delete().in_("incident_id", batch).execute()
            supabase.table("incidents").delete().in_("id", batch).execute()

        return {"status": "purged", "removed": len(foreign_ids), "kept_for": _MY_HOSTNAME}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/incidents/{incident_id}")
def get_incident(incident_id: str):
    try:
        incident  = supabase.table("incidents").select("*").eq("id", incident_id).eq("data_source", "real_capture").execute()
        actions   = supabase.table("agent_actions").select("*").eq("incident_id", incident_id).execute()
        decisions = supabase.table("decision_log").select("*").eq("incident_id", incident_id).execute()
        memory    = supabase.table("atlas_memory").select("*").eq("incident_id", incident_id).execute()
        real_actions = [
            a for a in actions.data
            if isinstance(a.get("params"), dict)
            and a["params"].get("data_source") == "real_capture"
        ]
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})

    # Flatten execution_outcomes from all decision log entries
    execution_outcomes = []
    pending_actions = []
    for d in decisions.data:
        plan = d.get("plan_json") or {}
        execution_outcomes.extend(plan.get("execution_outcomes") or [])
        pending_actions.extend(plan.get("pending_approval") or [])

    return {
        "incident":          incident.data,
        "actions":           real_actions,
        "decisions":         decisions.data,
        "memory":            memory.data,
        "execution_outcomes": execution_outcomes,
        "pending_actions":   list(set(pending_actions)),
    }


@router.post("/incidents/{incident_id}/approve")
def approve_incident(incident_id: str):
    try:
        # 1. Pull the latest decision log entry for this incident
        dec_rows = supabase.table("decision_log") \
            .select("id, plan_json") \
            .eq("incident_id", incident_id) \
            .order("ts", desc=True) \
            .limit(1) \
            .execute()

        pending_actions: list[str] = []
        agent_results: dict = {}
        dec_id = None
        existing_plan: dict = {}

        if dec_rows.data:
            dec_id        = dec_rows.data[0].get("id")
            existing_plan = dec_rows.data[0].get("plan_json") or {}
            pending_actions = existing_plan.get("pending_approval") or []
            agent_results   = existing_plan.get("agent_results") or {}

        # 2. Reconstruct event from agent_results targets — no events.incident_id column exists
        event: dict = {}
        for r in agent_results.values():
            if isinstance(r, dict):
                for field in ("target_ip", "source_ip", "target_user", "affected_user", "file_path", "pid"):
                    if r.get(field):
                        event[field] = r[field]

        # 3. Execute the pending actions for real on the machine
        outcomes = execute_actions(pending_actions, event, agent_results) if pending_actions else []

        # 4. Write outcomes back into the decision log row
        if dec_id:
            existing_plan["execution_outcomes"]  = (existing_plan.get("execution_outcomes") or []) + outcomes
            existing_plan["approved_by_operator"] = True
            supabase.table("decision_log") \
                .update({"plan_json": existing_plan}) \
                .eq("id", dec_id) \
                .execute()

        # 5. Mark incident approved
        supabase.table("incidents").update({"status": "approved"}).eq("id", incident_id).execute()

        executed_ok   = [o for o in outcomes if o.get("success")]
        executed_fail = [o for o in outcomes if not o.get("success")]

        try:
            from app.main import broadcast_state_update
            broadcast_state_update({"incident_id": incident_id, "action": "approved"})
        except Exception:
            pass

        return {
            "status":      "approved",
            "incident_id": incident_id,
            "actions_run": len(outcomes),
            "succeeded":   [o["action"] for o in executed_ok],
            "failed":      [o["action"] for o in executed_fail],
            "outcomes":    outcomes,
        }
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})


@router.post("/incidents/{incident_id}/resolve")
def resolve_incident(incident_id: str):
    try:
        supabase.table("incidents").update({"status": "resolved"}).eq("id", incident_id).execute()
        try:
            from app.main import broadcast_state_update
            broadcast_state_update({"incident_id": incident_id, "action": "resolved"})
        except Exception:
            pass
        return {"status": "resolved", "incident_id": incident_id}
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})


@router.get("/machine-profile")
def machine_profile():
    return get_profile()


# ── Archive endpoints ─────────────────────────────────────────────────────────

@router.post("/archive/migrate")
def archive_migrate():
    """
    One-time migration: moves all incidents NOT belonging to this laptop
    from the live DB into local archive JSON files.
    """
    try:
        all_incidents = (supabase.table("incidents")
                         .select("*")
                         .execute().data or [])
        foreign = [i for i in all_incidents
                   if _MY_HOSTNAME not in (i.get("title") or "")]
        if not foreign:
            return {"status": "nothing_to_migrate", "count": 0}

        # Group by hostname extracted from title (e.g. "... on Abishek-J29")
        by_host: dict = {}
        for inc in foreign:
            title = inc.get("title", "")
            host  = title.split(" on ")[-1].strip() if " on " in title else "unknown"
            by_host.setdefault(host, []).append(inc)

        migrated = 0
        for host, incidents in by_host.items():
            archive_records(host, incidents)
            # Remove from live DB
            ids = [i["id"] for i in incidents if i.get("id")]
            if ids:
                supabase.table("decision_log").delete().in_("incident_id", ids).execute()
                supabase.table("agent_actions").delete().in_("incident_id", ids).execute()
                supabase.table("incidents").delete().in_("id", ids).execute()
            migrated += len(incidents)

        return {"status": "migrated", "count": migrated,
                "hosts": list(by_host.keys())}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.get("/archive/incidents")
def archive_list():
    """Summary of all archived hosts and their record counts."""
    return get_archived_incidents()


@router.get("/archive/incidents/{hostname}")
def archive_by_host(hostname: str):
    """Full archived incidents and events for a specific host."""
    return get_archived_incidents(hostname=hostname)


@router.get("/stats/agents")
def agent_stats():
    try:
        actions = supabase.table("agent_actions").select("agent_name, action, params, incident_id").execute()
        # Only count actions linked to this machine's incidents
        my_incidents = set(
            i["id"] for i in (supabase.table("incidents")
                .select("id")
                .like("title", f"%{_MY_HOSTNAME}%")
                .execute().data or [])
        )
        counts: dict = {}
        for a in actions.data:
            if (isinstance(a.get("params"), dict)
                    and a["params"].get("data_source") == "real_capture"
                    and a.get("incident_id") in my_incidents):
                name = a.get("agent_name", "unknown")
                counts[name] = counts.get(name, 0) + 1
        return {"agent_activity": counts}
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})


@router.get("/memory/stats")
def memory_stats():
    try:
        data = supabase.table("atlas_memory").select("event_type, severity, source_ip, created_at").execute()
        rows = data.data or []
        type_counts: dict = {}
        ip_counts: dict = {}
        for m in rows:
            t = m.get("event_type", "unknown")
            type_counts[t] = type_counts.get(t, 0) + 1
            ip = m.get("source_ip")
            if ip and ip not in ("unknown", "external", None):
                ip_counts[ip] = ip_counts.get(ip, 0) + 1
        top_ips = sorted(ip_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        return {
            "total_memories":    len(rows),
            "by_type":           type_counts,
            "recurring_threats": {k: v for k, v in type_counts.items() if v >= 3},
            "top_offender_ips":  [{ "ip": ip, "count": c } for ip, c in top_ips],
        }
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": str(e)})


@router.post("/settings/posture-interval")
def set_posture_interval(body: dict):
    """Update posture check interval at runtime."""
    try:
        from app.network import capture as cap
        interval = int(body.get("interval_seconds", 300))
        interval = max(60, min(3600, interval))   # clamp 1min–1hr
        cap._POSTURE_COOLDOWN = interval
        return {"status": "ok", "interval_seconds": interval}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@router.post("/settings/repeat-offender-threshold")
def set_repeat_offender_threshold(body: dict):
    """Update how many times an IP must appear before auto-execute kicks in."""
    try:
        from app.memory import atlas_memory as mem
        threshold = int(body.get("threshold", 3))
        threshold = max(2, min(10, threshold))   # clamp 2–10
        mem._REPEAT_OFFENDER_THRESHOLD = threshold
        return {"status": "ok", "threshold": threshold}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
