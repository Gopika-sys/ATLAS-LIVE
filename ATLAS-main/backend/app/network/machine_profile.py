"""
ATLAS Machine Profile
Fingerprints the local laptop/server once at startup.
Injected into every event so all agents reason about THIS specific machine.
"""
import os
import sys
import socket
import platform
import subprocess
import psutil
from datetime import datetime, timezone

_profile: dict = {}


def _run(cmd: list[str]) -> str:
    try:
        return subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=5).decode(errors="ignore").strip()
    except Exception:
        return ""


def _get_local_ips() -> dict[str, str]:
    ips = {}
    for iface, addrs in psutil.net_if_addrs().items():
        for a in addrs:
            if a.family == socket.AF_INET:
                ips[iface] = a.address
    return ips


def _get_open_ports() -> list[dict]:
    ports = []
    seen = set()
    try:
        for c in psutil.net_connections(kind="inet"):
            if c.status == "LISTEN" and c.laddr:
                p = c.laddr.port
                if p in seen:
                    continue
                seen.add(p)
                try:
                    proc = psutil.Process(c.pid).name() if c.pid else "unknown"
                except Exception:
                    proc = "unknown"
                ports.append({"port": p, "process": proc})
    except Exception:
        pass
    return sorted(ports, key=lambda x: x["port"])


def _get_users() -> list[str]:
    users = set()
    try:
        for u in psutil.users():
            users.add(u.name)
    except Exception:
        pass
    # Windows: net user
    if platform.system() == "Windows":
        out = _run(["net", "user"])
        for line in out.splitlines()[4:]:
            for name in line.split():
                if name and not name.startswith("-"):
                    users.add(name)
    return sorted(users)


def _get_network_topology() -> dict:
    """Discover gateway, DNS, subnet."""
    topology = {}
    if platform.system() == "Windows":
        out = _run(["ipconfig", "/all"])
        for line in out.splitlines():
            l = line.strip()
            if "Default Gateway" in l:
                parts = l.split(":")
                if len(parts) > 1 and parts[-1].strip():
                    topology["gateway"] = parts[-1].strip()
            if "DNS Servers" in l:
                parts = l.split(":")
                if len(parts) > 1 and parts[-1].strip():
                    topology.setdefault("dns", []).append(parts[-1].strip())
            if "Subnet Mask" in l:
                parts = l.split(":")
                if len(parts) > 1 and parts[-1].strip():
                    topology["subnet_mask"] = parts[-1].strip()
    else:
        out = _run(["ip", "route"])
        for line in out.splitlines():
            if line.startswith("default"):
                parts = line.split()
                if len(parts) > 2:
                    topology["gateway"] = parts[2]
    return topology


def _get_firewall_status() -> dict:
    status = {"enabled": False, "details": "unknown"}
    if platform.system() == "Windows":
        out = _run(["netsh", "advfirewall", "show", "allprofiles", "state"])
        enabled = "ON" in out.upper()
        status = {"enabled": enabled, "details": out[:300] if out else "unavailable"}
    else:
        out = _run(["ufw", "status"])
        if not out:
            out = _run(["iptables", "-L", "-n", "--line-numbers"])
        status = {"enabled": "active" in out.lower() or "ACCEPT" in out, "details": out[:300]}
    return status


def _get_installed_security_tools() -> list[str]:
    tools = []
    candidates = [
        "defender", "malwarebytes", "avast", "avg", "kaspersky",
        "norton", "mcafee", "bitdefender", "crowdstrike", "sentinel",
        "wireshark", "nmap", "snort", "suricata", "ossec",
    ]
    if platform.system() == "Windows":
        out = _run(["wmic", "product", "get", "name"]).lower()
        for t in candidates:
            if t in out:
                tools.append(t)
        # Check Windows Defender specifically
        defender = _run(["powershell", "-Command",
                         "Get-MpComputerStatus | Select-Object -ExpandProperty AntivirusEnabled"])
        if "True" in defender:
            if "windows_defender" not in tools:
                tools.append("windows_defender")
    else:
        for t in candidates:
            if _run(["which", t]):
                tools.append(t)
    return tools


def _get_running_services() -> list[str]:
    services = []
    if platform.system() == "Windows":
        out = _run(["sc", "query", "type=", "running"])
        for line in out.splitlines():
            if "SERVICE_NAME" in line:
                services.append(line.split(":")[-1].strip())
    else:
        out = _run(["systemctl", "list-units", "--type=service", "--state=running", "--no-pager", "--plain"])
        for line in out.splitlines()[1:]:
            parts = line.split()
            if parts:
                services.append(parts[0].replace(".service", ""))
    return services[:40]  # cap at 40


def build_profile() -> dict:
    """Build and cache the machine profile. Call once at startup."""
    global _profile
    if _profile:
        return _profile  # already built — skip prints

    hostname = socket.gethostname()
    try:
        primary_ip = socket.gethostbyname(hostname)
    except Exception:
        primary_ip = "127.0.0.1"

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/") if os.path.exists("/") else psutil.disk_usage("C:\\")

    _profile = {
        "hostname":          hostname,
        "primary_ip":        primary_ip,
        "os":                f"{platform.system()} {platform.release()} {platform.version()[:60]}",
        "architecture":      platform.machine(),
        "python_version":    sys.version.split()[0],
        "cpu_cores":         psutil.cpu_count(logical=True),
        "ram_gb":            round(mem.total / (1024 ** 3), 1),
        "disk_gb":           round(disk.total / (1024 ** 3), 1),
        "network_interfaces": _get_local_ips(),
        "open_ports":        _get_open_ports(),
        "local_users":       _get_users(),
        "network_topology":  _get_network_topology(),
        "firewall":          _get_firewall_status(),
        "security_tools":    _get_installed_security_tools(),
        "running_services":  _get_running_services(),
        "profiled_at":       datetime.now(timezone.utc).isoformat(),
    }

    print(f"[ATLAS] Machine Profile: {hostname} ({primary_ip}) | {_profile['os']}")
    print(f"[ATLAS] Open ports: {[p['port'] for p in _profile['open_ports']]}")
    print(f"[ATLAS] Firewall: {'ENABLED' if _profile['firewall']['enabled'] else 'DISABLED'}")
    print(f"[ATLAS] Security tools: {_profile['security_tools'] or 'none detected'}")
    return _profile


def get_profile() -> dict:
    """Return cached profile (build if not yet built)."""
    return _profile if _profile else build_profile()


def get_agent_context_header() -> str:
    """
    Returns a compact text block injected into every agent system prompt.
    Agents use this to reason about the actual machine they're protecting.
    """
    p = get_profile()
    ports_str = ", ".join(f"{x['port']}({x['process']})" for x in p["open_ports"][:15])
    ifaces_str = ", ".join(f"{k}={v}" for k, v in p["network_interfaces"].items())
    fw = "ENABLED" if p["firewall"]["enabled"] else "DISABLED ⚠️"
    tools = ", ".join(p["security_tools"]) if p["security_tools"] else "none detected"
    gw = p["network_topology"].get("gateway", "unknown")
    users = ", ".join(p["local_users"][:10])

    return f"""
=== TARGET MACHINE CONTEXT ===
Hostname:        {p['hostname']}
Primary IP:      {p['primary_ip']}
OS:              {p['os']}
Network:         {ifaces_str}
Gateway:         {gw}
Open Ports:      {ports_str or 'none detected'}
Local Users:     {users or 'unknown'}
Firewall:        {fw}
Security Tools:  {tools}
RAM/CPU:         {p['ram_gb']}GB RAM, {p['cpu_cores']} cores
==============================
"""
