"""
ATLAS Login Monitor API
GET /login/live — live login sessions, failed attempts, active users for THIS machine only.
Uses psutil + wevtutil (no Admin needed on Win11) + net user.
"""

import socket
import subprocess
import platform
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.network.machine_profile import get_profile

router = APIRouter(prefix="/login", tags=["login"])

MY_HOSTNAME = socket.gethostname()
try:
    MY_IP = socket.gethostbyname(MY_HOSTNAME)
except Exception:
    MY_IP = "127.0.0.1"

WIN = platform.system() == "Windows"


def _run(cmd: list) -> str:
    try:
        return subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=8
        ).decode(errors="ignore")
    except Exception:
        return ""


# ── Collectors ────────────────────────────────────────────────────────────────

def _active_sessions() -> list[dict]:
    """Live interactive sessions via psutil.users() — always works."""
    sessions = []
    now_hour = datetime.now().hour
    known = {u.lower() for u in get_profile().get("local_users", [])}

    for u in psutil.users():
        uname = u.name.lower()
        after_hours = not (8 <= now_hour < 20)
        sessions.append({
            "user":        u.name,
            "terminal":    u.terminal or "local",
            "host":        u.host or MY_IP,
            "started":     datetime.fromtimestamp(u.started).strftime("%H:%M:%S") if u.started else "—",
            "known_user":  uname in known if known else True,
            "after_hours": after_hours,
            "risk":        (
                "critical" if (known and uname not in known) else
                "medium"   if after_hours else
                "low"
            ),
        })
    return sessions


def _local_accounts() -> list[dict]:
    """All local accounts via `net user` (Windows) or /etc/passwd (Linux)."""
    accounts = []
    if WIN:
        out = _run(["net", "user"])
        # Skip header/footer lines — accounts start after line 4
        lines = out.splitlines()
        in_accounts = False
        for line in lines:
            if "---" in line:
                in_accounts = not in_accounts
                continue
            if in_accounts and line.strip():
                for name in line.split():
                    if name and not name.startswith("-"):
                        accounts.append({"username": name, "source": "net_user"})
    else:
        out = _run(["cut", "-d:", "-f1", "/etc/passwd"])
        for name in out.splitlines():
            if name.strip():
                accounts.append({"username": name.strip(), "source": "passwd"})
    return accounts


def _recent_logins() -> list[dict]:
    """
    Recent successful + failed logons via wevtutil (Win11, no Admin needed).
    Falls back to empty list if access denied.
    """
    if not WIN:
        return []

    logins = []
    try:
        out = subprocess.check_output(
            ["wevtutil", "qe", "Security",
             "/q:*[System[(EventID=4624 or EventID=4625)]]",
             "/c:30", "/rd:true", "/f:text"],
            stderr=subprocess.DEVNULL, timeout=10
        ).decode(errors="ignore")
    except Exception:
        return []

    current: dict = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Event["):
            if current.get("event_id"):
                logins.append(current)
            current = {}
        elif "Event ID:" in line:
            try:
                current["event_id"] = int(line.split(":")[-1].strip())
                current["type"] = "success" if current["event_id"] == 4624 else "failed"
            except ValueError:
                pass
        elif "Date:" in line:
            current["time"] = line.split(":", 1)[-1].strip()
        elif "Account Name:" in line:
            val = line.split(":")[-1].strip()
            if val and val not in ("-", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE", ""):
                current.setdefault("user", val)
        elif "Source Network Address:" in line or "Workstation Name:" in line:
            val = line.split(":")[-1].strip()
            if val and val not in ("-", ""):
                current.setdefault("source_ip", val)
        elif "Logon Type:" in line:
            try:
                lt = int(line.split(":")[-1].strip())
                current["logon_type"] = {
                    2: "Interactive", 3: "Network", 4: "Batch",
                    5: "Service", 7: "Unlock", 10: "RemoteInteractive",
                    11: "CachedInteractive",
                }.get(lt, str(lt))
            except Exception:
                pass

    if current.get("event_id"):
        logins.append(current)

    # Enrich with risk level
    known = {u.lower() for u in get_profile().get("local_users", [])}
    for login in logins:
        user = (login.get("user") or "").lower()
        login["known_user"] = (user in known) if known else True
        login["risk"] = (
            "critical" if (known and user and user not in known) else
            "high"     if login["type"] == "failed" else
            "low"
        )

    return logins[:30]


def _failed_login_summary() -> dict:
    """Count failed logins per user from wevtutil output."""
    logins = _recent_logins()
    counts: dict[str, int] = {}
    for l in logins:
        if l.get("type") == "failed" and l.get("user"):
            u = l["user"]
            counts[u] = counts.get(u, 0) + 1
    return counts


def _password_policy() -> dict:
    """Read password policy via `net accounts`."""
    if not WIN:
        return {}
    out = _run(["net", "accounts"])
    policy: dict = {}
    for line in out.splitlines():
        line = line.strip()
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        val = val.strip()
        if "Minimum password length" in key:
            try:
                policy["min_length"] = int(val)
                policy["min_length_ok"] = int(val) >= 8
            except Exception:
                pass
        elif "Maximum password age" in key:
            policy["max_age_days"] = val
        elif "Minimum password age" in key:
            policy["min_age_days"] = val
        elif "Password history" in key:
            policy["history"] = val
        elif "Lockout threshold" in key:
            policy["lockout_threshold"] = val
        elif "Lockout duration" in key:
            policy["lockout_duration"] = val
    return policy


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get("/live")
def login_live():
    """
    GET /login/live — live login data for THIS machine only.

    Returns:
      - active_sessions  : currently logged-in users (psutil)
      - recent_logins    : last 30 logon events from Security log (wevtutil)
      - failed_summary   : failed login counts per user
      - local_accounts   : all local accounts (net user)
      - password_policy  : current password policy (net accounts)
      - machine          : hostname, IP, known users
      - risk_summary     : counts by risk level
      - timestamp        : UTC ISO-8601
    """
    try:
        profile        = get_profile()
        sessions       = _active_sessions()
        recent         = _recent_logins()
        failed_summary = _failed_login_summary()
        accounts       = _local_accounts()
        policy         = _password_policy()

        risk_summary = {
            "critical": sum(1 for s in sessions if s["risk"] == "critical"),
            "medium":   sum(1 for s in sessions if s["risk"] == "medium"),
            "low":      sum(1 for s in sessions if s["risk"] == "low"),
            "failed_logins_total": sum(failed_summary.values()),
        }

        overall = (
            "critical" if risk_summary["critical"] > 0 else
            "high"     if risk_summary["failed_logins_total"] >= 5 else
            "medium"   if risk_summary["medium"] > 0 else
            "low"
        )

        return {
            "timestamp":      datetime.now(timezone.utc).isoformat(),
            "overall_risk":   overall,
            "machine": {
                "hostname":    profile.get("hostname", MY_HOSTNAME),
                "primary_ip":  profile.get("primary_ip", MY_IP),
                "known_users": profile.get("local_users", []),
            },
            "active_sessions":  sessions,
            "recent_logins":    recent,
            "failed_summary":   failed_summary,
            "local_accounts":   accounts,
            "password_policy":  policy,
            "risk_summary":     risk_summary,
        }

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
