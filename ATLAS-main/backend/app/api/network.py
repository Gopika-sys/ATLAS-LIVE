"""
ATLAS Network Monitor API
GET  /network/live    — poll-friendly live snapshot
POST /network/monitor — same data, POST variant
"""

import re
import socket
import subprocess
import time
import platform
from collections import defaultdict
from datetime import datetime, timezone

import psutil
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.network.machine_profile import get_profile

router = APIRouter(prefix="/network", tags=["network"])

# ── Constants ─────────────────────────────────────────────────────────────────

_C2_PORTS         = {4444, 1337, 9001, 31337, 6666, 5555, 2222, 1234, 3333, 14444}
_SUSPICIOUS_PORTS = {23, 135, 137, 138, 139, 445, 3389, 5900} | _C2_PORTS
_PRIVATE_PREFIXES = (
    "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
    "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
    "172.30.", "172.31.", "192.168.", "127.",
)

MY_HOSTNAME = socket.gethostname()
try:
    MY_IP = socket.gethostbyname(MY_HOSTNAME)
except Exception:
    MY_IP = "127.0.0.1"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_private(ip: str) -> bool:
    return any(ip.startswith(p) for p in _PRIVATE_PREFIXES)


def _resolve_hostname(ip: str) -> str:
    try:
        return socket.gethostbyaddr(ip)[0]
    except Exception:
        return ip


def _get_process_name(pid) -> str:
    if not pid:
        return "unknown"
    try:
        return psutil.Process(pid).name()
    except Exception:
        return "unknown"


def _run_cmd(cmd: list) -> str:
    try:
        return subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=8
        ).decode(errors="ignore")
    except Exception:
        return ""


# ── Collectors ────────────────────────────────────────────────────────────────

def _collect_connections() -> tuple[list[dict], dict[str, int]]:
    """All active TCP/UDP connections with src/dst/protocol/port/process/packet_count."""
    connections: list[dict] = []
    packet_counts: dict[str, int] = defaultdict(int)

    try:
        raw = psutil.net_connections(kind="inet")
    except Exception:
        return connections, packet_counts

    for c in raw:
        rip   = c.raddr.ip   if c.raddr else None
        rport = c.raddr.port if c.raddr else None
        if rip:
            packet_counts[rip] += 1

        connections.append({
            "source_ip":        c.laddr.ip   if c.laddr else MY_IP,
            "source_port":      c.laddr.port if c.laddr else 0,
            "destination_ip":   rip   or "—",
            "destination_port": rport or 0,
            "protocol":         "TCP" if c.type == socket.SOCK_STREAM else "UDP",
            "status":           c.status or "—",
            "process":          _get_process_name(c.pid),
            "pid":              c.pid,
            "packet_count":     packet_counts[rip] if rip else 0,
        })

    return connections, dict(packet_counts)


def _collect_bandwidth() -> dict:
    """Two-snapshot bandwidth measurement (1 s apart) for live bytes/sec rate."""
    s1 = psutil.net_io_counters(pernic=False)
    time.sleep(1)
    s2 = psutil.net_io_counters(pernic=False)

    # Per-NIC breakdown (no sleep needed — delta already captured above)
    per_nic: list[dict] = []
    try:
        nic1 = psutil.net_io_counters(pernic=True)
        for name, c in nic1.items():
            per_nic.append({
                "interface":    name,
                "mb_sent":      round(c.bytes_sent / (1024 ** 2), 2),
                "mb_recv":      round(c.bytes_recv / (1024 ** 2), 2),
                "packets_sent": c.packets_sent,
                "packets_recv": c.packets_recv,
            })
    except Exception:
        pass

    return {
        "bytes_sent_total":   s2.bytes_sent,
        "bytes_recv_total":   s2.bytes_recv,
        "bytes_sent_per_sec": max(0, s2.bytes_sent - s1.bytes_sent),
        "bytes_recv_per_sec": max(0, s2.bytes_recv - s1.bytes_recv),
        "packets_sent_total": s2.packets_sent,
        "packets_recv_total": s2.packets_recv,
        "mb_sent_total":      round(s2.bytes_sent / (1024 ** 2), 2),
        "mb_recv_total":      round(s2.bytes_recv / (1024 ** 2), 2),
        "kb_sent_per_sec":    round(max(0, s2.bytes_sent - s1.bytes_sent) / 1024, 1),
        "kb_recv_per_sec":    round(max(0, s2.bytes_recv - s1.bytes_recv) / 1024, 1),
        "per_interface":      per_nic,
    }


def _collect_devices() -> list[dict]:
    """LAN devices from ARP cache + this machine itself."""
    devices: list[dict] = []
    seen: set = set()
    gateway = get_profile().get("network_topology", {}).get("gateway", "")

    out = _run_cmd(["arp", "-a"])
    for line in out.splitlines():
        parts = line.split()
        ip = mac = None
        for part in parts:
            if part.startswith("(") and part.endswith(")"):
                ip = part[1:-1]
            elif part.count(".") == 3:
                segs = part.split(".")
                if all(s.isdigit() and 0 <= int(s) <= 255 for s in segs):
                    ip = part
            if (part.count("-") == 5 or part.count(":") == 5) and len(part) == 17:
                mac = part
        if ip and _is_private(ip) and ip not in seen:
            seen.add(ip)
            devices.append({
                "ip":         ip,
                "mac":        mac or "unknown",
                "hostname":   _resolve_hostname(ip),
                "is_gateway": ip == gateway,
                "is_self":    ip == MY_IP,
            })

    if MY_IP not in seen:
        devices.insert(0, {
            "ip": MY_IP, "mac": "local",
            "hostname": MY_HOSTNAME, "is_gateway": False, "is_self": True,
        })

    return devices


def _collect_wifi() -> dict:
    """
    WiFi info using two sources:
      1. psutil.net_if_stats/addrs  — always works, no admin/location needed
      2. netsh wlan show interfaces — richer data, needs Location ON + Admin
    Falls back gracefully when netsh is blocked by Windows permissions.
    """
    # ── Step 1: find Wi-Fi interface via psutil (always available) ────────
    wifi_iface_name: str | None = None
    wifi_ip:         str | None = None
    wifi_speed_mbps: int        = 0
    wifi_is_up:      bool       = False

    try:
        stats = psutil.net_if_stats()
        addrs = psutil.net_if_addrs()
        for name, st in stats.items():
            if any(kw in name.lower() for kw in ("wi-fi", "wifi", "wireless", "wlan")):
                wifi_iface_name = name
                wifi_is_up      = st.isup
                wifi_speed_mbps = st.speed
                for addr in addrs.get(name, []):
                    if addr.family == socket.AF_INET:
                        wifi_ip = addr.address
                break
    except Exception:
        pass

    if not wifi_iface_name:
        return {"available": False, "reason": "No wireless interface found"}

    info: dict = {
        "available":        True,
        "interface_name":   wifi_iface_name,
        "state":            "connected" if wifi_is_up else "disconnected",
        "ip":               wifi_ip or "unknown",
        "link_speed_mbps":  wifi_speed_mbps,
        "ssid":             "(enable Location Services + run as Admin to see SSID)",
        "bssid":            "—",
        "band":             "—",
        "channel":          "—",
        "authentication":   "—",
        "cipher":           "—",
        "signal_pct":       0,
        "receive_mbps":     0.0,
        "transmit_mbps":    0.0,
        "signal_bar":       "▂___",
        "netsh_available":  False,
    }

    if not wifi_is_up or platform.system() != "Windows":
        return info

    # ── Step 2: enrich with netsh when permissions allow ──────────────────
    out = _run_cmd(["netsh", "wlan", "show", "interfaces"])
    blocked = not out or "location permission" in out.lower() or "requires elevation" in out.lower()

    if blocked:
        info["netsh_blocked"] = True
        info["netsh_reason"]  = (
            "Turn on Location Services (Settings > Privacy & Security > Location) "
            "and restart the backend as Administrator to see SSID/signal."
        )
        return info

    def _field(label: str) -> str:
        m = re.search(rf"{re.escape(label)}\s*:\s*(.+)", out)
        return m.group(1).strip() if m else ""

    def _mbps(label: str) -> float:
        try:
            return float(_field(label).split()[0])
        except Exception:
            return 0.0

    try:
        signal_pct = int(_field("Signal").replace("%", "").strip())
    except Exception:
        signal_pct = 0

    info.update({
        "ssid":           _field("SSID") or info["ssid"],
        "bssid":          _field("BSSID"),
        "state":          _field("State") or info["state"],
        "band":           _field("Radio type"),
        "channel":        _field("Channel"),
        "authentication": _field("Authentication"),
        "cipher":         _field("Cipher"),
        "signal_pct":     signal_pct,
        "receive_mbps":   _mbps("Receive rate"),
        "transmit_mbps":  _mbps("Transmit rate"),
        "signal_bar": (
            "▂▄▆█" if signal_pct >= 75 else
            "▂▄▆_" if signal_pct >= 50 else
            "▂▄__" if signal_pct >= 25 else
            "▂___"
        ),
        "netsh_available": True,
    })
    return info


def _collect_wifi_networks() -> list[dict]:
    """
    All visible WiFi networks via `netsh wlan show networks mode=bssid`.
    Returns empty list when Location permission / Admin is not available.
    """
    if platform.system() != "Windows":
        return []

    out = _run_cmd(["netsh", "wlan", "show", "networks", "mode=bssid"])
    if not out or "location permission" in out.lower() or "requires elevation" in out.lower():
        return []

    networks: list[dict] = []
    cur: dict = {}

    for line in out.splitlines():
        line = line.strip()
        if line.startswith("SSID") and ":" in line and "BSSID" not in line:
            if cur.get("ssid"):
                networks.append(cur)
            cur = {"ssid": line.split(":", 1)[1].strip()}
        elif "Authentication" in line and ":" in line:
            cur["authentication"] = line.split(":", 1)[1].strip()
        elif "Encryption" in line and ":" in line:
            cur["encryption"] = line.split(":", 1)[1].strip()
        elif "Signal" in line and ":" in line:
            try:
                cur["signal_pct"] = int(line.split(":", 1)[1].strip().replace("%", ""))
            except Exception:
                cur["signal_pct"] = 0
        elif "Radio type" in line and ":" in line:
            cur["band"] = line.split(":", 1)[1].strip()
        elif "Channel" in line and ":" in line:
            cur["channel"] = line.split(":", 1)[1].strip()
        elif line.startswith("BSSID") and ":" in line:
            cur.setdefault("bssid", line.split(":", 1)[1].strip())

    if cur.get("ssid"):
        networks.append(cur)

    return networks[:20]


# ── Threat detection ──────────────────────────────────────────────────────────

def _detect_threats(
    connections: list[dict],
    packet_counts: dict[str, int],
    bandwidth: dict,
    profile: dict,
) -> list[dict]:
    threats: list[dict] = []
    ports_per_src: dict[str, set] = defaultdict(set)

    for conn in connections:
        src   = conn["source_ip"]
        dst   = conn["destination_ip"]
        dport = conn["destination_port"]
        proto = conn["protocol"]

        if dst in ("—", None):
            continue

        # C2 / reverse-shell
        if dport in _C2_PORTS and not _is_private(dst) and conn["status"] == "ESTABLISHED":
            threats.append({
                "type":               "reverse_shell",
                "severity":           "critical",
                "indicator":          f"{src} → {dst}:{dport} ({proto})",
                "description":        f"Outbound connection to known C2 port {dport} on {dst}",
                "recommended_action": "block_ip",
                "process":            conn["process"],
            })
        # Suspicious port
        elif dport in _SUSPICIOUS_PORTS and not _is_private(dst):
            threats.append({
                "type":               "suspicious_traffic",
                "severity":           "high",
                "indicator":          f"{src} → {dst}:{dport} ({proto})",
                "description":        f"Connection to suspicious port {dport} on external host {dst}",
                "recommended_action": "alert_admin",
                "process":            conn["process"],
            })

        # Port scan tracking
        if not _is_private(src) and src != MY_IP:
            ports_per_src[src].add(dport)

    # Port scan: ≥20 unique ports from one external source
    for src_ip, ports in ports_per_src.items():
        if len(ports) >= 20:
            threats.append({
                "type":               "port_scan",
                "severity":           "high",
                "indicator":          f"{src_ip} → {len(ports)} ports",
                "description":        f"Port scan from {src_ip} — {len(ports)} unique destination ports",
                "recommended_action": "block_ip",
                "process":            "network_level",
            })

    # Abnormal outbound bandwidth >10 MB/s
    if bandwidth["bytes_sent_per_sec"] > 10 * 1024 * 1024:
        mb_s = round(bandwidth["bytes_sent_per_sec"] / (1024 ** 2), 1)
        threats.append({
            "type":               "data_exfiltration",
            "severity":           "high",
            "indicator":          f"{mb_s} MB/s outbound",
            "description":        f"Abnormally high outbound bandwidth: {mb_s} MB/s",
            "recommended_action": "alert_admin",
            "process":            "network_level",
        })

    return threats


def _overall_status(threats: list[dict]) -> str:
    if not threats:
        return "clean"
    for level in ("critical", "high", "medium", "low"):
        if any(t["severity"] == level for t in threats):
            return level
    return "clean"


# ── Core logic (shared by GET + POST) ────────────────────────────────────────

def _run_monitor():
    try:
        profile       = get_profile()
        connections, packet_counts = _collect_connections()
        bandwidth     = _collect_bandwidth()
        devices       = _collect_devices()
        wifi          = _collect_wifi()
        wifi_networks = _collect_wifi_networks()
        threats       = _detect_threats(connections, packet_counts, bandwidth, profile)

        alerts = [
            {"id": i + 1, "severity": t["severity"],
             "message": t["description"], "action": t["recommended_action"]}
            for i, t in enumerate(threats)
        ]

        return {
            "timestamp":      datetime.now(timezone.utc).isoformat(),
            "network_status": _overall_status(threats),
            "machine": {
                "hostname":   profile.get("hostname", MY_HOSTNAME),
                "primary_ip": profile.get("primary_ip", MY_IP),
                "os":         profile.get("os", "unknown"),
                "gateway":    profile.get("network_topology", {}).get("gateway", "unknown"),
                "firewall":   profile.get("firewall", {}).get("enabled", False),
            },
            "wifi":          wifi,
            "wifi_networks": wifi_networks,
            "connections":   connections,
            "devices":       devices,
            "bandwidth":     bandwidth,
            "threats":       threats,
            "alerts":        alerts,
            "summary": {
                "total_connections": len(connections),
                "total_devices":     len(devices),
                "total_threats":     len(threats),
                "threat_breakdown": {
                    "critical": sum(1 for t in threats if t["severity"] == "critical"),
                    "high":     sum(1 for t in threats if t["severity"] == "high"),
                    "medium":   sum(1 for t in threats if t["severity"] == "medium"),
                    "low":      sum(1 for t in threats if t["severity"] == "low"),
                },
            },
        }
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "network_status": "error"})


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/live")
def network_live():
    """GET /network/live — poll-friendly live network snapshot."""
    return _run_monitor()


@router.post("/monitor")
def network_monitor():
    """POST /network/monitor — live network snapshot."""
    return _run_monitor()
