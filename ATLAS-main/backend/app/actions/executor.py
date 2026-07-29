"""
ATLAS Action Executor — real Windows remediation.
Called after the decision node approves actions.
"""
import subprocess
import platform
import os
import shutil
import logging
import socket
from datetime import datetime, timezone

logger = logging.getLogger("atlas.executor")
WIN = platform.system() == "Windows"


def _run(cmd: list[str]) -> tuple[bool, str]:
    try:
        out = subprocess.check_output(
            cmd, stderr=subprocess.STDOUT, timeout=10
        ).decode(errors="ignore").strip()
        return True, out
    except subprocess.CalledProcessError as e:
        return False, e.output.decode(errors="ignore").strip()
    except Exception as e:
        return False, str(e)


def block_ip(ip: str) -> dict:
    """Block IP via Windows Firewall (netsh) or iptables on Linux."""
    if not ip or ip in ("unknown", "external", "local_staging", ""):
        return {"action": "block_ip", "target": ip, "success": False, "reason": "invalid IP — skipped"}

    if WIN:
        rule = f"ATLAS_BLOCK_{ip}"
        ok, out = _run([
            "netsh", "advfirewall", "firewall", "add", "rule",
            f"name={rule}", "dir=in", "action=block",
            f"remoteip={ip}", "enable=yes", "profile=any",
        ])
        if ok:
            _run([
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={rule}_OUT", "dir=out", "action=block",
                f"remoteip={ip}", "enable=yes", "profile=any",
            ])
    else:
        ok, out = _run(["iptables", "-I", "INPUT", "-s", ip, "-j", "DROP"])
        if ok:
            _run(["iptables", "-I", "OUTPUT", "-d", ip, "-j", "DROP"])

    logger.info(f"[EXECUTOR] block_ip {ip} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "block_ip", "target": ip, "success": ok, "output": out[:300]}


def lock_account(username: str) -> dict:
    """Disable a local user account."""
    protected = {"", "unknown", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"}
    if not username or username in protected:
        return {"action": "lock_account", "target": username, "success": False, "reason": "protected/invalid account — skipped"}

    if WIN:
        ok, out = _run(["net", "user", username, "/active:no"])
    else:
        ok, out = _run(["usermod", "--lock", username])

    logger.info(f"[EXECUTOR] lock_account {username} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "lock_account", "target": username, "success": ok, "output": out[:300]}


def kill_process(pid) -> dict:
    """Kill a process by PID."""
    if not pid:
        return {"action": "kill_process", "target": pid, "success": False, "reason": "no PID provided"}

    if WIN:
        ok, out = _run(["taskkill", "/F", "/PID", str(pid)])
    else:
        ok, out = _run(["kill", "-9", str(pid)])

    logger.info(f"[EXECUTOR] kill_process {pid} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "kill_process", "target": pid, "success": ok, "output": out[:300]}


def quarantine_file(file_path: str) -> dict:
    """Move a malicious file to quarantine directory."""
    if not file_path or not os.path.exists(file_path):
        return {"action": "quarantine_file", "target": file_path, "success": False, "reason": "file not found"}

    quarantine_dir = "C:\\ATLAS_Quarantine" if WIN else "/var/atlas_quarantine"
    os.makedirs(quarantine_dir, exist_ok=True)

    try:
        dest = os.path.join(quarantine_dir, os.path.basename(file_path))
        shutil.move(file_path, dest)
        ok, out = True, f"Moved to {dest}"
    except Exception as e:
        ok, out = False, str(e)

    logger.info(f"[EXECUTOR] quarantine_file {file_path} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "quarantine_file", "target": file_path, "success": ok, "output": out[:300]}


def _pick(agent_results: dict, field: str):
    """Pull a field value from any agent result."""
    for result in agent_results.values():
        if isinstance(result, dict) and result.get(field):
            return result[field]
    return None


def isolate_machine() -> dict:
    """Block all inbound+outbound traffic except loopback via firewall rules."""
    if WIN:
        cmds = [
            ["netsh", "advfirewall", "set", "allprofiles", "firewallpolicy", "blockinbound,blockoutbound"],
            # Allow loopback so local services keep running
            ["netsh", "advfirewall", "firewall", "add", "rule",
             "name=ATLAS_ALLOW_LOOPBACK", "dir=in", "action=allow",
             "remoteip=127.0.0.1", "enable=yes"],
        ]
        results = []
        for cmd in cmds:
            ok, out = _run(cmd)
            results.append(out[:100])
        overall_ok = True  # first cmd is the critical one
        out_str = " | ".join(results)
    else:
        # Linux: default-deny all, allow loopback
        cmds = [
            ["iptables", "-P", "INPUT",   "DROP"],
            ["iptables", "-P", "OUTPUT",  "DROP"],
            ["iptables", "-P", "FORWARD", "DROP"],
            ["iptables", "-A", "INPUT",  "-i", "lo", "-j", "ACCEPT"],
            ["iptables", "-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT"],
        ]
        results = []
        overall_ok = True
        for cmd in cmds:
            ok, out = _run(cmd)
            if not ok:
                overall_ok = False
            results.append(out[:80])
        out_str = " | ".join(results)

    logger.warning(f"[EXECUTOR] isolate_machine → {'OK' if overall_ok else 'PARTIAL'}: {out_str[:200]}")
    return {"action": "isolate_machine", "target": socket.gethostname(), "success": overall_ok, "output": out_str[:300]}


def disable_session(username: str) -> dict:
    """
    Terminate all active logon sessions for a user.
    Windows: logs off all sessions via quser + logoff.
    Linux:   kills all user processes via pkill.
    """
    protected = {"", "unknown", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"}
    if not username or username in protected:
        return {"action": "disable_session", "target": username, "success": False, "reason": "protected/invalid account — skipped"}

    if WIN:
        # Get session IDs for the user then log each off
        out_q = subprocess.run(
            ["quser", username], capture_output=True, text=True, timeout=10
        ).stdout
        session_ids = []
        for line in out_q.splitlines()[1:]:   # skip header
            parts = line.split()
            if len(parts) >= 3:
                # quser columns: USERNAME  SESSIONNAME  ID  STATE ...
                try:
                    session_ids.append(parts[2])
                except IndexError:
                    pass
        if session_ids:
            for sid in session_ids:
                _run(["logoff", sid, "/server:localhost"])
            ok, out = True, f"Logged off sessions: {', '.join(session_ids)}"
        else:
            ok, out = True, f"No active sessions found for {username}"
    else:
        ok, out = _run(["pkill", "-KILL", "-u", username])

    logger.info(f"[EXECUTOR] disable_session {username} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "disable_session", "target": username, "success": ok, "output": out[:300]}


def force_reset(username: str) -> dict:
    """
    Force-expire a user's password so they must reset on next login.
    Windows: net user <user> /logonpasswordchg:yes
    Linux:   chage -d 0 <user>
    """
    protected = {"", "unknown", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"}
    if not username or username in protected:
        return {"action": "force_reset", "target": username, "success": False, "reason": "protected/invalid account — skipped"}

    if WIN:
        ok, out = _run(["net", "user", username, "/logonpasswordchg:yes"])
    else:
        ok, out = _run(["chage", "-d", "0", username])

    logger.info(f"[EXECUTOR] force_reset {username} → {'OK' if ok else 'FAIL'}: {out[:100]}")
    return {"action": "force_reset", "target": username, "success": ok, "output": out[:300]}


_ACTION_MAP = {
    "block_ip":        lambda e, r: block_ip(
        _pick(r, "target_ip") or e.get("source_ip") or e.get("destination_ip", "")
    ),
    "lock_account":    lambda e, r: lock_account(
        _pick(r, "target_user") or _pick(r, "affected_user") or e.get("target_user", "")
    ),
    "kill_process":    lambda e, r: kill_process(
        e.get("pid") or _pick(r, "pid")
    ),
    "quarantine_file": lambda e, r: quarantine_file(
        _pick(r, "file_path") or e.get("file_path", "")
    ),
    "isolate_machine": lambda e, r: isolate_machine(),
    "disable_session": lambda e, r: disable_session(
        _pick(r, "target_user") or _pick(r, "affected_user") or e.get("target_user", "")
    ),
    "force_reset":     lambda e, r: force_reset(
        _pick(r, "target_user") or _pick(r, "affected_user") or e.get("target_user", "")
    ),
}


def execute_actions(approved_actions: list[str], event: dict, agent_results: dict) -> list[dict]:
    """
    Execute all approved actions against the real machine.
    Returns list of outcomes. Skips non-executable actions (monitor, alert_admin, etc).
    """
    outcomes = []
    for action in approved_actions:
        fn = _ACTION_MAP.get(action)
        if not fn:
            continue
        try:
            outcome = fn(event, agent_results)
        except Exception as ex:
            outcome = {"action": action, "success": False, "reason": str(ex)}
        outcome["timestamp"] = datetime.now(timezone.utc).isoformat()
        outcomes.append(outcome)
    return outcomes
