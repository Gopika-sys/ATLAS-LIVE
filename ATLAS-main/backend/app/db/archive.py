"""
ATLAS Archive — stores records from foreign hosts (non-local machines)
into local JSON files under app/db/archive/.

Each host gets its own file: archive/<hostname>.json
Records can be retrieved anytime via get_archived_incidents().
"""
import json
import os
from datetime import datetime, timezone

_ARCHIVE_DIR = os.path.join(os.path.dirname(__file__), "archive")


def _archive_path(hostname: str) -> str:
    # Sanitise hostname for use as filename
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in hostname)
    return os.path.join(_ARCHIVE_DIR, f"{safe}.json")


def _load(hostname: str) -> dict:
    path = _archive_path(hostname)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"hostname": hostname, "archived_at": None, "incidents": [], "events": []}


def _save(hostname: str, data: dict):
    os.makedirs(_ARCHIVE_DIR, exist_ok=True)
    data["archived_at"] = datetime.now(timezone.utc).isoformat()
    with open(_archive_path(hostname), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)


def archive_records(hostname: str, incidents: list, events: list = None):
    """Append incidents (and optionally events) for a foreign host to its archive file."""
    data = _load(hostname)
    existing_ids = {r["id"] for r in data["incidents"] if "id" in r}
    for inc in incidents:
        if inc.get("id") not in existing_ids:
            data["incidents"].append(inc)
    if events:
        existing_event_ids = {r["id"] for r in data["events"] if "id" in r}
        for ev in events:
            if ev.get("id") not in existing_event_ids:
                data["events"].append(ev)
    _save(hostname, data)


def get_archived_incidents(hostname: str = None) -> dict:
    """
    Return archived records.
    - hostname=None  → returns all hosts with their record counts
    - hostname=<str> → returns full records for that host
    """
    os.makedirs(_ARCHIVE_DIR, exist_ok=True)
    files = [f for f in os.listdir(_ARCHIVE_DIR) if f.endswith(".json")]

    if hostname:
        return _load(hostname)

    # Summary of all archived hosts
    summary = []
    for fname in sorted(files):
        host = fname[:-5]  # strip .json
        data = _load(host)
        summary.append({
            "hostname":        data.get("hostname", host),
            "archived_at":     data.get("archived_at"),
            "incident_count":  len(data.get("incidents", [])),
            "event_count":     len(data.get("events", [])),
        })
    return {"archived_hosts": summary}


def list_archived_hostnames() -> list[str]:
    os.makedirs(_ARCHIVE_DIR, exist_ok=True)
    return [f[:-5] for f in os.listdir(_ARCHIVE_DIR) if f.endswith(".json")]
