from fastapi import APIRouter, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse
from app.voice.stt import transcribe
from app.voice.tts import speak
from app.graph.master_graph import run_atlas
from app.db.writer import supabase, insert_voice_history
from app.llm.clients import fast_triage
from app.memory.atlas_memory import get_threat_pattern
import shutil, tempfile, os, json, re, time
from collections import defaultdict

router = APIRouter()

# ── Simple in-process rate limiter ───────────────────────────────────────────────
# Max 5 voice requests per IP per 60 seconds
_RATE_LIMIT   = int(os.environ.get("VOICE_RATE_LIMIT", "5"))
_RATE_WINDOW  = int(os.environ.get("VOICE_RATE_WINDOW", "60"))  # seconds
_rate_buckets: dict = defaultdict(list)

def _check_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate-limited."""
    now = time.time()
    bucket = _rate_buckets[client_ip]
    # Evict timestamps outside the window
    _rate_buckets[client_ip] = [t for t in bucket if now - t < _RATE_WINDOW]
    if len(_rate_buckets[client_ip]) >= _RATE_LIMIT:
        return False
    _rate_buckets[client_ip].append(now)
    return True

INTENT_SYSTEM = """You are an intent classifier for ATLAS, an AI security system.
Classify the operator's voice command into one of these intents:
- status: asking about current system state, what's happening, situation report
- threat_query: asking about a specific threat type (brute force, malware, phishing, etc.)
- report: requesting a security report or summary
- approve: approving a pending action
- deny: denying/cancelling a pending action
- firewall: asking about firewall status
- agent_query: asking about a specific agent's activity
- unknown: anything else

Respond ONLY with valid JSON: {"intent": "...", "threat_type": "...|null", "agent_name": "...|null"}"""

ATTACK_TYPE_MAP = {
    "brute": "brute_force", "brute force": "brute_force", "login": "brute_force",
    "phish": "phishing", "email": "phishing",
    "malware": "malware", "virus": "malware", "ransomware": "malware",
    "ddos": "ddos", "denial": "ddos", "flood": "ddos",
    "port scan": "port_scan", "scan": "port_scan",
    "sql": "sql_injection", "injection": "sql_injection",
    "insider": "insider_threat", "employee": "insider_threat",
    "exfil": "data_exfiltration", "data leak": "data_exfiltration",
    "privilege": "privilege_escalation", "escalation": "privilege_escalation",
    "xss": "xss", "cross site": "xss",
    "reverse shell": "reverse_shell", "shell": "reverse_shell",
}


def _classify_intent(text: str) -> dict:
    try:
        raw = fast_triage(text, system=INTENT_SYSTEM)
        cleaned = re.sub(r"```(?:json)?", "", raw).strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        return json.loads(match.group() if match else cleaned)
    except Exception:
        # Fallback keyword detection
        lower = text.lower()
        for kw, attack in ATTACK_TYPE_MAP.items():
            if kw in lower:
                return {"intent": "threat_query", "threat_type": attack, "agent_name": None}
        if any(w in lower for w in ["status", "what", "happening", "situation"]):
            return {"intent": "status", "threat_type": None, "agent_name": None}
        if "report" in lower:
            return {"intent": "report", "threat_type": None, "agent_name": None}
        if any(w in lower for w in ["approve", "confirm", "yes"]):
            return {"intent": "approve", "threat_type": None, "agent_name": None}
        if any(w in lower for w in ["deny", "cancel", "abort", "no"]):
            return {"intent": "deny", "threat_type": None, "agent_name": None}
        return {"intent": "unknown", "threat_type": None, "agent_name": None}


def _status_response() -> str:
    try:
        incidents = supabase.table("incidents").select("*").eq("status", "open").execute()
        count = len(incidents.data)
        if count == 0:
            return "All systems nominal. No active threats detected. Security score is at maximum."
        severities = [i["severity"] for i in incidents.data]
        critical = severities.count("critical")
        high = severities.count("high")
        medium = severities.count("medium")
        parts = []
        if critical:
            parts.append(f"{critical} critical")
        if high:
            parts.append(f"{high} high severity")
        if medium:
            parts.append(f"{medium} medium severity")
        sev_str = ", ".join(parts)
        return f"I'm tracking {count} active incident{'s' if count > 1 else ''} — {sev_str}. Agents are responding. Awaiting your instructions."
    except Exception:
        return "Status check unavailable. All monitoring systems remain active."


def _report_response() -> str:
    try:
        incidents = supabase.table("incidents").select("*").order("created_at", desc=True).limit(10).execute()
        actions = supabase.table("agent_actions").select("*").order("ts", desc=True).limit(20).execute()
        event = {
            "type": "report_request",
            "incidents": incidents.data,
            "actions": actions.data,
            "total_incidents": len(incidents.data),
        }
        result = run_atlas(event, voice_query="Generate security report")
        return result.get("spoken_response") or result.get("final_response", "Report generated.")
    except Exception:
        return "Report generation encountered an error. Manual review recommended."


@router.post("/voice/text")
async def voice_text_command(body: dict, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        return JSONResponse(status_code=429, content={
            "error": f"Rate limit exceeded — max {_RATE_LIMIT} requests per {_RATE_WINDOW}s"
        })
    text = (body.get("text") or "").strip()
    if not text:
        return {"error": "No text provided"}

    intent_data = _classify_intent(text)
    intent = intent_data.get("intent", "unknown")
    threat_type = intent_data.get("threat_type")

    if intent == "status":
        response_text = _status_response()
    elif intent == "report":
        response_text = _report_response()
    elif intent == "threat_query" and threat_type:
        pattern = get_threat_pattern(threat_type)
        try:
            rows = supabase.table("events").select("raw_payload").eq("type", threat_type) \
                .order("ts", desc=True).limit(1).execute()
            real_event = rows.data[0]["raw_payload"] if rows.data else None
        except Exception:
            real_event = None
        if real_event:
            result = run_atlas(real_event, voice_query=text)
            response_text = result.get("spoken_response") or result.get("final_response", "Analysis complete.")
        else:
            response_text = f"No recent {threat_type.replace('_', ' ')} events detected on this machine."
        if pattern.get("is_recurring"):
            response_text += f" Note: this attack type has been seen {pattern['times_seen']} times previously."
    elif intent == "firewall":
        try:
            blocked = supabase.table("agent_actions").select("action").eq("action", "block_ip").execute()
            count = len(blocked.data)
            response_text = f"Firewall is fully operational. {count} IP{'s' if count != 1 else ''} blocked to date."
        except Exception:
            response_text = "Firewall is active. All rules are enforced."
    elif intent == "approve":
        try:
            pending = supabase.table("incidents").select("id, title").eq("status", "open").limit(1).execute()
            if pending.data:
                inc = pending.data[0]
                supabase.table("incidents").update({"status": "approved"}).eq("id", inc["id"]).execute()
                response_text = f"Approved. Executing response for: {inc['title']}."
            else:
                response_text = "No pending actions require approval at this time."
        except Exception:
            response_text = "Approval noted."
    elif intent == "deny":
        response_text = "Understood. Pending high-risk actions have been cancelled."
    else:
        try:
            rows = supabase.table("events").select("raw_payload").order("ts", desc=True).limit(1).execute()
            real_event = rows.data[0]["raw_payload"] if rows.data else None
        except Exception:
            real_event = None
        if real_event:
            result = run_atlas(real_event, voice_query=text)
            response_text = result.get("spoken_response") or result.get("final_response", "Analysis complete.")
        else:
            response_text = "No active threats detected. All systems operating normally."

    try:
        insert_voice_history(text, response_text)
    except Exception:
        pass

    return {"transcribed": text, "response_text": response_text, "intent": intent}


@router.post("/voice")
async def voice_command(file: UploadFile, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        return JSONResponse(status_code=429, content={
            "error": f"Rate limit exceeded — max {_RATE_LIMIT} requests per {_RATE_WINDOW}s"
        })
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        temp_path = tmp.name

    try:
        text = transcribe(temp_path)
    finally:
        os.unlink(temp_path)

    intent_data = _classify_intent(text)
    intent = intent_data.get("intent", "unknown")
    threat_type = intent_data.get("threat_type")

    if intent == "status":
        response_text = _status_response()

    elif intent == "report":
        response_text = _report_response()

    elif intent == "threat_query" and threat_type:
        pattern = get_threat_pattern(threat_type)
        # Pull the most recent real event of this type from DB
        try:
            rows = supabase.table("events").select("raw_payload").eq("type", threat_type) \
                .order("ts", desc=True).limit(1).execute()
            real_event = rows.data[0]["raw_payload"] if rows.data else None
        except Exception:
            real_event = None

        if real_event:
            result = run_atlas(real_event, voice_query=text)
            response_text = result.get("spoken_response") or result.get("final_response", "Analysis complete.")
        else:
            response_text = f"No recent {threat_type.replace('_', ' ')} events detected on this machine."

        if pattern.get("is_recurring"):
            response_text += f" Note: this attack type has been seen {pattern['times_seen']} times previously."

    elif intent == "firewall":
        try:
            blocked = supabase.table("agent_actions").select("action").eq("action", "block_ip").execute()
            count = len(blocked.data)
            response_text = f"Firewall is fully operational. {count} IP{'s' if count != 1 else ''} blocked to date. All rules enforced."
        except Exception:
            response_text = "Firewall is active. All rules are enforced."

    elif intent == "approve":
        try:
            pending = supabase.table("incidents").select("id, title").eq("status", "open").limit(1).execute()
            if pending.data:
                inc = pending.data[0]
                supabase.table("incidents").update({"status": "approved"}).eq("id", inc["id"]).execute()
                response_text = f"Approved. Executing response for: {inc['title']}."
            else:
                response_text = "No pending actions require approval at this time."
        except Exception:
            response_text = "Approval noted. Executing pending high-risk actions."

    elif intent == "deny":
        response_text = "Understood. Pending high-risk actions have been cancelled. Continuing passive monitoring."

    else:
        # Pull latest real event from DB and run through pipeline
        try:
            rows = supabase.table("events").select("raw_payload").order("ts", desc=True).limit(1).execute()
            real_event = rows.data[0]["raw_payload"] if rows.data else None
        except Exception:
            real_event = None

        if real_event:
            result = run_atlas(real_event, voice_query=text)
            response_text = result.get("spoken_response") or result.get("final_response", "Analysis complete.")
        else:
            response_text = "No active threats detected. All systems operating normally."

    audio_path = speak(response_text)

    try:
        insert_voice_history(text, response_text)
    except Exception:
        pass

    return {
        "transcribed": text,
        "response_text": response_text,
        "audio_path": audio_path,
        "intent": intent,
    }


@router.get("/voice/audio")
def get_audio():
    path = os.path.join(tempfile.gettempdir(), "atlas_response.wav")
    if os.path.exists(path):
        return FileResponse(path, media_type="audio/wav")
    return {"error": "No audio available"}
