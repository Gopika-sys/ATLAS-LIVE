"""
ATLAS Real Capture Engine — real data only, zero simulation.

Collectors:
  1. psutil       — outbound connections to C2 ports, net I/O spikes
  2. scapy        — SYN scans, DNS tunneling (needs Npcap + Admin)
  3. win32evtlog  — Event IDs 4625/4672/4698/4720/4732 (needs Admin)
  4. watchdog     — malicious file drops in Downloads/Desktop/Temp
  5. topology     — new listening ports vs baseline (60s)
  6. posture      — firewall off, Defender off, weak password policy (5min)
  7. authlog      — Linux /var/log/auth.log SSH brute force
"""

import os
import uuid
import time
import socket
import hashlib
import threading
import platform
import subprocess
from collections import defaultdict, deque
from datetime import datetime, timezone
from queue import Queue, Empty

import psutil

try:
    from scapy.all import sniff, IP, TCP, UDP, DNS, DNSQR, conf as scapy_conf
    scapy_conf.verb = 0
    SCAPY_OK = True
except Exception:
    SCAPY_OK = False

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_OK = True
except Exception:
    WATCHDOG_OK = False

WIN = platform.system() == "Windows"
try:
    if WIN:
        import win32evtlog
        import win32evtlogutil
        WIN32_OK = True
    else:
        WIN32_OK = False
except Exception:
    WIN32_OK = False

# ── shared queue ──────────────────────────────────────────────────────────────
event_queue: Queue = Queue(maxsize=2000)

# ── state ─────────────────────────────────────────────────────────────────────
_conn_history:  dict = defaultdict(lambda: deque(maxlen=500))
_packet_counts: dict = defaultdict(int)
_failed_logins: dict = defaultdict(int)
_seen_pids:     set  = set()
_lock = threading.Lock()

# ── constants ─────────────────────────────────────────────────────────────────
# Known attacker / C2 ports — NOT normal Windows service ports
C2_PORTS = {4444, 1337, 9001, 31337, 6666, 5555, 2222, 1234, 3333, 14444}

# Only these tools are inherently suspicious regardless of context
NETCAT_TOOLS = {"nc.exe", "ncat.exe", "netcat.exe", "ncat", "nc"}

# Malicious script extensions dropped in user dirs
MALICIOUS_EXTS = {".vbs", ".hta", ".pif", ".scr"}

# Suspicious PowerShell flags indicating fileless malware
PS_MALICIOUS_FLAGS = (
    "-encodedcommand", "-enc ", "iex(", "invoke-expression",
    "downloadstring(", "-noprofile -noninteractive", "bypass -nop",
)

# Directories to watch for malicious file drops
WATCH_DIRS = list(filter(os.path.isdir, [
    os.path.expanduser("~/Downloads"),
    os.path.expanduser("~/Desktop"),
    "C:\\Windows\\Temp",
    "C:\\Users\\Public",
    "/tmp", "/var/tmp",
]))

# Private IP ranges — never flag as external attackers
PRIVATE_PREFIXES = (
    "10.", "172.16.", "172.17.", "172.18.", "172.19.",
    "172.20.", "172.21.", "172.22.", "172.23.", "172.24.",
    "172.25.", "172.26.", "172.27.", "172.28.", "172.29.",
    "172.30.", "172.31.", "192.168.", "127.", "::1", "fe80",
)

MY_HOSTNAME = socket.gethostname()
try:
    MY_IP = socket.gethostbyname(MY_HOSTNAME)
except Exception:
    MY_IP = "127.0.0.1"

_machine_profile: dict = {}


# ── helpers ───────────────────────────────────────────────────────────────────
def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()

def _uid() -> str:
    return str(uuid.uuid4())

def _is_private(ip: str) -> bool:
    return any(ip.startswith(p) for p in PRIVATE_PREFIXES)

def _dir_accessible(path: str) -> bool:
    try:
        os.listdir(path)
        return True
    except Exception:
        return False
def _push(event: dict):
    event.setdefault("id",        _uid())
    event.setdefault("timestamp", _ts())
    event.setdefault("source_ip", MY_IP)
    event.setdefault("hostname",  MY_HOSTNAME)
    event["source"] = "real_capture"   # mark every event as real
    if _machine_profile:
        event["machine"] = {
            "hostname":    _machine_profile.get("hostname"),
            "primary_ip":  _machine_profile.get("primary_ip"),
            "os":          _machine_profile.get("os"),
            "open_ports":  [p["port"] for p in _machine_profile.get("open_ports", [])[:15]],
            "firewall_on": _machine_profile.get("firewall", {}).get("enabled", True),
            "users":       _machine_profile.get("local_users", []),
            "security_tools": _machine_profile.get("security_tools", []),
        }
    try:
        event_queue.put_nowait(event)
    except Exception:
        pass

def _file_hash(path: str) -> str:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()[:16]
    except Exception:
        return "unknown"

def _run_cmd(cmd: list) -> str:
    try:
        return subprocess.check_output(
            cmd, stderr=subprocess.DEVNULL, timeout=8
        ).decode(errors="ignore").strip()
    except Exception:
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# 1. PSUTIL — outbound C2 connections + net I/O exfiltration
# ══════════════════════════════════════════════════════════════════════════════
def _psutil_monitor():
    while True:
        try:
            _check_outbound_connections()
            _check_new_processes()
            _check_net_io()
        except Exception:
            pass
        time.sleep(3)


def _check_outbound_connections():
    """Flag only outbound connections to known C2 ports on external IPs."""
    try:
        conns = psutil.net_connections(kind="inet")
    except Exception:
        return

    for c in conns:
        if not c.raddr:
            continue
        rip   = c.raddr.ip
        rport = c.raddr.port

        # Skip all private/loopback IPs
        if _is_private(rip):
            continue

        # Outbound ESTABLISHED connection to a known C2 port
        if c.status == "ESTABLISHED" and rport in C2_PORTS:
            try:
                pname = psutil.Process(c.pid).name() if c.pid else "unknown"
                pcmd  = " ".join(psutil.Process(c.pid).cmdline()) if c.pid else ""
            except Exception:
                pname, pcmd = "unknown", ""
            _push({
                "type":             "reverse_shell",
                "destination_ip":   rip,
                "destination_port": rport,
                "process":          pname,
                "cmdline":          pcmd[:200],
                "pid":              c.pid,
                "collector":        "psutil_connections",
            })

        # Track connection rate per remote IP for DDoS detection
        with _lock:
            _conn_history[rip].append(time.time())

    # DDoS: >200 connections to same external IP in 10s window
    now = time.time()
    with _lock:
        for ip, times in list(_conn_history.items()):
            recent = [t for t in times if now - t < 10]
            if len(recent) > 200:
                _push({
                    "type":             "ddos",
                    "destination_ip":   ip,
                    "requests_per_sec": len(recent) // 10,
                    "protocol":         "TCP",
                    "collector":        "psutil_connections",
                })
                _conn_history[ip].clear()


def _check_new_processes():
    """
    Only flag:
    - Netcat / raw shell tools (nc, ncat, netcat)
    - PowerShell with encoded/bypass/download flags
    - .vbs/.hta/.scr/.pif files outside system directories
    """
    for proc in psutil.process_iter(["pid", "name", "exe", "cmdline", "username"]):
        try:
            pid  = proc.info["pid"]
            name = (proc.info["name"] or "").lower()
            exe  = (proc.info["exe"]  or "").lower()
            cmd  = " ".join(proc.info["cmdline"] or []).lower()

            if pid in _seen_pids:
                continue
            _seen_pids.add(pid)

            # Netcat tools — always a red flag
            if name in NETCAT_TOOLS:
                _push({
                    "type":             "reverse_shell",
                    "process":          name,
                    "exe":              exe,
                    "cmdline":          cmd[:300],
                    "user":             proc.info["username"],
                    "destination_ip":   "unknown",
                    "destination_port": 0,
                    "collector":        "psutil_processes",
                })

            # PowerShell with malicious flags only
            elif name in ("powershell.exe", "pwsh.exe"):
                if any(flag in cmd for flag in PS_MALICIOUS_FLAGS):
                    _push({
                        "type":         "malware",
                        "malware_name": "fileless_powershell",
                        "file_path":    exe,
                        "hash":         _file_hash(exe),
                        "cmdline":      cmd[:300],
                        "user":         proc.info["username"],
                        "collector":    "psutil_processes",
                    })

            # Malicious script extensions — only outside Windows system dirs
            else:
                _, ext = os.path.splitext(exe)
                is_system = any(exe.startswith(p) for p in (
                    "c:\\windows\\", "c:\\program files\\",
                    "c:\\program files (x86)\\", "c:\\programdata\\microsoft\\",
                ))
                if ext in MALICIOUS_EXTS and not is_system:
                    _push({
                        "type":         "malware",
                        "malware_name": name,
                        "file_path":    exe,
                        "hash":         _file_hash(exe),
                        "cmdline":      cmd[:300],
                        "user":         proc.info["username"],
                        "collector":    "psutil_processes",
                    })

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass


def _check_net_io():
    """Flag >50MB outbound in a 3s window as data exfiltration."""
    net = psutil.net_io_counters()
    if not hasattr(_check_net_io, "_last"):
        _check_net_io._last = net
        return
    last = _check_net_io._last
    sent_mb = (net.bytes_sent - last.bytes_sent) / (1024 * 1024)
    if sent_mb > 50:
        _push({
            "type":           "data_exfiltration",
            "data_volume_mb": round(sent_mb, 1),
            "protocol":       "TCP",
            "destination_ip": "external",
            "collector":      "psutil_net_io",
        })
    _check_net_io._last = net


# ══════════════════════════════════════════════════════════════════════════════
# 2. SCAPY — raw packet analysis (needs Npcap + Admin)
# ══════════════════════════════════════════════════════════════════════════════
def _packet_callback(pkt):
    try:
        if not pkt.haslayer(IP):
            return
        src = pkt[IP].src
        dst = pkt[IP].dst

        # DNS tunneling: only flag queries originating from THIS machine
        if pkt.haslayer(DNS) and pkt.haslayer(DNSQR) and src == MY_IP:
            qname = pkt[DNSQR].qname.decode(errors="ignore").rstrip(".")
            labels = qname.split(".")
            # Flag if any label is >40 chars (base64/hex encoded data)
            if any(len(lbl) > 40 for lbl in labels):
                _push({
                    "type":           "data_exfiltration",
                    "protocol":       "DNS_tunnel",
                    "destination_ip": dst,
                    "dns_query":      qname[:100],
                    "data_volume_mb": 0,
                    "collector":      "scapy_dns",
                })
            return

        if pkt.haslayer(TCP):
            flags = pkt[TCP].flags
            dport = pkt[TCP].dport

            # SYN scan: only flag scans targeting THIS machine
            if flags == 0x02 and not _is_private(src) and dst == MY_IP:
                with _lock:
                    _packet_counts[src] += 1
                    if _packet_counts[src] >= 100:
                        _push({
                            "type":          "port_scan",
                            "source_ip":     src,
                            "ports_scanned": _packet_counts[src],
                            "duration_sec":  1,
                            "collector":     "scapy_syn",
                        })
                        _packet_counts[src] = 0

            # Outbound C2: only flag when THIS machine is the source
            if src == MY_IP and dport in C2_PORTS and not _is_private(dst):
                _push({
                    "type":             "reverse_shell",
                    "source_ip":        src,
                    "destination_ip":   dst,
                    "destination_port": dport,
                    "process":          "packet_level",
                    "collector":        "scapy_tcp",
                })

    except Exception:
        pass


_SCAPY_LIVE = False  # set True only if sniffing actually works

def _scapy_sniff():
    global _SCAPY_LIVE
    if not SCAPY_OK:
        return
    try:
        sniff(prn=_packet_callback, store=False, filter="ip", count=0,
              started_callback=lambda: globals().update(_SCAPY_LIVE=True))
    except Exception as e:
        print(f"[ATLAS] Scapy: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 3. WINDOWS EVENT LOG (needs Admin)
# ══════════════════════════════════════════════════════════════════════════════
def _winlog_monitor():
    if not WIN32_OK:
        return
    try:
        handle = win32evtlog.OpenEventLog(None, "Security")
    except Exception as e:
        print(f"[ATLAS] Win EventLog: needs Admin — {e}")
        return

    flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
    seen: set = set()

    while True:
        try:
            events = win32evtlog.ReadEventLog(handle, flags, 0)
            for ev in (events or []):
                eid = ev.EventID & 0xFFFF
                key = (eid, str(ev.TimeGenerated))
                if key in seen:
                    continue
                seen.add(key)

                def _get_user(msg_text):
                    for line in msg_text.split("\n"):
                        if "Account Name" in line:
                            val = line.split(":")[-1].strip()
                            if val and val not in ("", "-", "SYSTEM"):
                                return val
                    return "unknown"

                # 4625 — failed logon
                if eid == 4625:
                    try:
                        msg  = win32evtlogutil.SafeFormatMessage(ev, "Security")
                        user = _get_user(msg)
                    except Exception:
                        user = "unknown"
                    _failed_logins[user] += 1
                    if _failed_logins[user] >= 5:
                        _push({
                            "type":          "brute_force",
                            "failed_logins": _failed_logins[user],
                            "target_user":   user,
                            "target_port":   0,
                            "event_id":      4625,
                            "collector":     "winlog",
                        })

                # 4672 — special privileges assigned (privilege escalation)
                elif eid == 4672:
                    try:
                        msg  = win32evtlogutil.SafeFormatMessage(ev, "Security")
                        user = _get_user(msg)
                    except Exception:
                        user = "unknown"
                    # Skip SYSTEM/LOCAL SERVICE — normal Windows behaviour
                    if user not in ("SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE", "unknown"):
                        _push({
                            "type":                "privilege_escalation",
                            "user":                user,
                            "attempted_privilege": "SeDebugPrivilege/SeTcbPrivilege",
                            "method":              "windows_special_privileges",
                            "event_id":            4672,
                            "collector":           "winlog",
                        })

                # 4698 — scheduled task created (persistence mechanism)
                elif eid == 4698:
                    try:
                        msg       = win32evtlogutil.SafeFormatMessage(ev, "Security")
                        task_name = next((l.split(":")[-1].strip()
                                          for l in msg.split("\n") if "Task Name" in l), "unknown")
                    except Exception:
                        task_name = "unknown"
                    _push({
                        "type":         "malware",
                        "malware_name": "scheduled_task_persistence",
                        "file_path":    f"Task: {task_name}",
                        "hash":         "persistence",
                        "event_id":     4698,
                        "collector":    "winlog",
                    })

                # 4720 — new local user account created
                elif eid == 4720:
                    try:
                        msg  = win32evtlogutil.SafeFormatMessage(ev, "Security")
                        user = _get_user(msg)
                    except Exception:
                        user = "unknown"
                    _push({
                        "type":        "insider_threat",
                        "behavior":    "new_local_account_created",
                        "target_user": user,
                        "event_id":    4720,
                        "collector":   "winlog",
                    })

                # 4732 — user added to Administrators group
                elif eid == 4732:
                    try:
                        msg  = win32evtlogutil.SafeFormatMessage(ev, "Security")
                        user = _get_user(msg)
                    except Exception:
                        user = "unknown"
                    _push({
                        "type":                "privilege_escalation",
                        "user":                user,
                        "method":              "added_to_administrators_group",
                        "attempted_privilege": "Administrator",
                        "event_id":            4732,
                        "collector":           "winlog",
                    })

        except Exception:
            pass
        time.sleep(5)


# ══════════════════════════════════════════════════════════════════════════════
# 4. FILESYSTEM WATCHER — malicious drops in user directories
# ══════════════════════════════════════════════════════════════════════════════
if WATCHDOG_OK:
    class _FileHandler(FileSystemEventHandler):
        def on_created(self, event):
            if event.is_directory:
                return
            path = event.src_path
            _, ext = os.path.splitext(path.lower())
            if ext in MALICIOUS_EXTS:
                _push({
                    "type":         "malware",
                    "malware_name": os.path.basename(path),
                    "file_path":    path,
                    "hash":         _file_hash(path),
                    "collector":    "watchdog",
                })

        def on_modified(self, event):
            if event.is_directory:
                return
            try:
                size_mb = os.path.getsize(event.src_path) / (1024 * 1024)
                if size_mb > 100:
                    _push({
                        "type":           "data_exfiltration",
                        "data_volume_mb": round(size_mb, 1),
                        "protocol":       "FILE",
                        "destination_ip": "local_staging",
                        "file_path":      event.src_path,
                        "collector":      "watchdog",
                    })
            except Exception:
                pass


def _fs_watch():
    if not WATCHDOG_OK:
        return
    observer = Observer()
    handler  = _FileHandler()
    scheduled = 0
    for d in WATCH_DIRS:
        try:
            # Probe access before scheduling to avoid PermissionError on start()
            os.listdir(d)
            observer.schedule(handler, d, recursive=False)
            scheduled += 1
        except Exception:
            pass
    if not scheduled:
        return
    try:
        observer.start()
        observer.join()
    except Exception as e:
        print(f"[ATLAS] Watchdog: {e}")


# ══════════════════════════════════════════════════════════════════════════════
# 5. TOPOLOGY MONITOR — new listening ports vs startup baseline
# ══════════════════════════════════════════════════════════════════════════════
def _topology_monitor():
    baseline: set = set()
    first = True
    while True:
        try:
            current: dict = {}
            for c in psutil.net_connections(kind="inet"):
                if c.status == "LISTEN" and c.laddr:
                    p = c.laddr.port
                    try:
                        proc = psutil.Process(c.pid).name() if c.pid else "unknown"
                    except Exception:
                        proc = "unknown"
                    current[p] = proc

            cur_set = set(current.keys())
            if first:
                baseline = cur_set
                first = False
            else:
                for p in cur_set - baseline:
                    proc = current.get(p, "unknown")
                    # Only flag if it's not a known safe process
                    if proc.lower() not in ("svchost.exe", "system", "lsass.exe",
                                            "services.exe", "wininit.exe"):
                        _push({
                            "type":          "port_scan",
                            "source_ip":     MY_IP,
                            "new_port":      p,
                            "process":       proc,
                            "ports_scanned": 1,
                            "description":   f"New listener: port {p} opened by {proc}",
                            "collector":     "topology",
                        })
                    baseline.add(p)
                for p in baseline - cur_set:
                    baseline.discard(p)
        except Exception:
            pass
        time.sleep(60)


# ══════════════════════════════════════════════════════════════════════════════
# 6. SECURITY POSTURE MONITOR — real Windows security checks
# Only fires when state CHANGES — no duplicate incidents every 5 minutes
# ══════════════════════════════════════════════════════════════════════════════
_posture_state: dict = {}        # tracks last known state per check
_posture_fired: dict = {}        # tracks last fire time per subtype
_POSTURE_COOLDOWN = 3600         # 1 hour — suppress re-fires within this window

def _posture_changed(key: str, value) -> bool:
    """Return True only if this finding is new/changed AND outside the cooldown window."""
    now = time.time()
    if _posture_state.get(key) == value:
        return False
    if now - _posture_fired.get(key, 0) < _POSTURE_COOLDOWN:
        return False
    _posture_state[key] = value
    _posture_fired[key] = now
    return True


def _posture_monitor():
    """
    Checks every 5 minutes.
    Only emits an event when a finding CHANGES state (e.g. firewall goes OFF).
    Prevents duplicate incidents on every poll cycle.
    """
    while True:
        try:
            if WIN:
                # ── Firewall ──────────────────────────────────────────────
                fw = _run_cmd(["netsh", "advfirewall", "show", "allprofiles", "state"])
                fw_off = bool(fw and "OFF" in fw.upper())
                if fw_off and _posture_changed("firewall_off", True):
                    _push({
                        "type":           "security_posture",
                        "subtype":        "firewall_disabled",
                        "description":    "Windows Firewall is DISABLED on one or more profiles",
                        "severity":       "high",
                        "recommendation": "Enable Windows Firewall on all profiles immediately",
                        "collector":      "posture",
                    })
                elif not fw_off:
                    _posture_state["firewall_off"] = False
                    _posture_fired.pop("firewall_off", None)

                # ── Windows Defender ──────────────────────────────────────
                av = _run_cmd(["powershell", "-Command",
                    "Get-MpComputerStatus | Select-Object "
                    "AntivirusEnabled,RealTimeProtectionEnabled | ConvertTo-Json"])
                av_off = bool(av and "false" in av.lower())
                if av_off and _posture_changed("av_off", True):
                    _push({
                        "type":           "security_posture",
                        "subtype":        "antivirus_disabled",
                        "description":    "Windows Defender or Real-Time Protection is DISABLED",
                        "severity":       "critical",
                        "recommendation": "Re-enable Windows Defender immediately",
                        "collector":      "posture",
                    })
                elif not av_off:
                    _posture_state["av_off"] = False
                    _posture_fired.pop("av_off", None)

                # ── Password Policy ───────────────────────────────────────
                pw = _run_cmd(["net", "accounts"])
                if pw:
                    for line in pw.splitlines():
                        if "Minimum password length" in line:
                            try:
                                length = int(line.split(":")[-1].strip())
                                if length < 8 and _posture_changed("pw_length", length):
                                    _push({
                                        "type":           "security_posture",
                                        "subtype":        "weak_password_policy",
                                        "description":    f"Password policy: minimum length is {length} (should be ≥8)",
                                        "password_score": length,
                                        "severity":       "medium",
                                        "recommendation": "Set minimum password length to 12+ characters",
                                        "collector":      "posture",
                                    })
                            except ValueError:
                                pass

                # ── Guest Account ─────────────────────────────────────────
                guest = _run_cmd(["net", "user", "guest"])
                guest_on = bool(guest and "Account active" in guest and "Yes" in guest)
                if guest_on and _posture_changed("guest_on", True):
                    _push({
                        "type":           "security_posture",
                        "subtype":        "guest_account_active",
                        "description":    "Guest account is ENABLED — potential unauthorized access vector",
                        "severity":       "medium",
                        "recommendation": "Disable the Guest account",
                        "collector":      "posture",
                    })
                elif not guest_on:
                    _posture_state["guest_on"] = False
                    _posture_fired.pop("guest_on", None)

        except Exception:
            pass
        time.sleep(300)


# ══════════════════════════════════════════════════════════════════════════════
# 7. LINUX AUTH LOG
# ══════════════════════════════════════════════════════════════════════════════
def _authlog_monitor():
    if WIN:
        return
    for path in ("/var/log/auth.log", "/var/log/secure"):
        if os.path.exists(path):
            break
    else:
        return
    try:
        with open(path, "r") as f:
            f.seek(0, 2)
            while True:
                line = f.readline()
                if not line:
                    time.sleep(1)
                    continue
                if "Failed password" in line or "Invalid user" in line:
                    parts = line.split()
                    user, ip = "unknown", "unknown"
                    for i, p in enumerate(parts):
                        if p in ("user", "for") and i + 1 < len(parts):
                            user = parts[i + 1]
                        if p == "from" and i + 1 < len(parts):
                            ip = parts[i + 1]
                    _failed_logins[ip] += 1
                    if _failed_logins[ip] >= 5:
                        _push({
                            "type":          "brute_force",
                            "source_ip":     ip,
                            "failed_logins": _failed_logins[ip],
                            "target_user":   user,
                            "target_port":   22,
                            "collector":     "authlog",
                        })
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
# 8. LOGIN MONITOR — wevtutil (no Admin needed) + psutil session tracking
# ══════════════════════════════════════════════════════════════════════════════
_seen_sessions: set = set()   # (user, terminal, host) already reported
_seen_logon_ids: set = set()  # wevtutil event RecordIds already processed

def _login_monitor():
    """
    Two sources:
    a) wevtutil — queries Security log for 4624/4625 without Admin on most
       Windows 11 builds (Event Log Readers group). Falls back gracefully.
    b) psutil.users() — catches new interactive sessions and unknown accounts.
    Polls every 15 s.
    """
    while True:
        try:
            _check_wevtutil_logins()
            _check_psutil_sessions()
        except Exception:
            pass
        time.sleep(15)


def _check_wevtutil_logins():
    """Query last 20 Security events for 4624/4625 via wevtutil (no Admin on Win11)."""
    if not WIN:
        return
    try:
        # Query last 20 logon/failed-logon events
        out = subprocess.check_output(
            ["wevtutil", "qe", "Security",
             "/q:*[System[(EventID=4624 or EventID=4625)]]",
             "/c:20", "/rd:true", "/f:text"],
            stderr=subprocess.DEVNULL, timeout=8
        ).decode(errors="ignore")
    except Exception:
        return

    known_users = set(u.lower() for u in _machine_profile.get("local_users", []))
    now_hour    = datetime.now().hour
    after_hours = not (8 <= now_hour < 20)

    current_eid, record_id, user, src_ip = None, None, "unknown", "unknown"
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Event["):
            # Process previous block
            if record_id and record_id not in _seen_logon_ids:
                _seen_logon_ids.add(record_id)
                _emit_login_event(current_eid, user, src_ip, known_users, after_hours)
            current_eid, record_id, user, src_ip = None, None, "unknown", "unknown"
        elif "Event ID:" in line:
            try:
                current_eid = int(line.split(":")[-1].strip())
            except ValueError:
                pass
        elif "Record ID:" in line:
            record_id = line.split(":")[-1].strip()
        elif "Account Name:" in line:
            val = line.split(":")[-1].strip()
            if val and val not in ("-", "SYSTEM", "LOCAL SERVICE", "NETWORK SERVICE"):
                user = val
        elif "Source Network Address:" in line or "Workstation Name:" in line:
            val = line.split(":")[-1].strip()
            if val and val not in ("-", ""):
                src_ip = val

    # Process last block
    if record_id and record_id not in _seen_logon_ids:
        _seen_logon_ids.add(record_id)
        _emit_login_event(current_eid, user, src_ip, known_users, after_hours)

    # Keep set bounded
    if len(_seen_logon_ids) > 500:
        _seen_logon_ids.clear()


def _emit_login_event(eid, user, src_ip, known_users, after_hours):
    if not eid or user == "unknown":
        return
    uname = user.lower()

    if eid == 4625:  # Failed logon
        _failed_logins[uname] += 1
        count = _failed_logins[uname]
        if count >= 5:
            _push({
                "type":          "brute_force",
                "failed_logins": count,
                "target_user":   user,
                "source_ip":     src_ip,
                "target_port":   0,
                "event_id":      4625,
                "collector":     "login_monitor",
            })

    elif eid == 4624:  # Successful logon
        if known_users and uname not in known_users:
            _push({
                "type":        "insider_threat",
                "behavior":    "unknown_user_logon",
                "target_user": user,
                "source_ip":   src_ip,
                "event_id":    4624,
                "collector":   "login_monitor",
            })
        elif after_hours:
            _push({
                "type":          "brute_force",
                "failed_logins": 0,
                "target_user":   user,
                "source_ip":     src_ip,
                "target_port":   0,
                "after_hours":   True,
                "event_id":      4624,
                "collector":     "login_monitor",
            })


def _check_psutil_sessions():
    """Catch new interactive sessions and unknown accounts via psutil."""
    known_users = set(u.lower() for u in _machine_profile.get("local_users", []))
    for u in psutil.users():
        key = (u.name, u.terminal or "", u.host or "")
        if key in _seen_sessions:
            continue
        _seen_sessions.add(key)
        uname = u.name.lower()
        src   = u.host if u.host else MY_IP
        if known_users and uname not in known_users:
            _push({
                "type":        "insider_threat",
                "behavior":    "unknown_user_session",
                "target_user": u.name,
                "source_ip":   src,
                "terminal":    u.terminal or "local",
                "collector":   "login_monitor",
            })

# ══════════════════════════════════════════════════════════════════════════════
def start_collectors():
    global _machine_profile
    from app.network.machine_profile import build_profile
    _machine_profile = build_profile()

    threads = [
        threading.Thread(target=_psutil_monitor,  daemon=True, name="atlas-psutil"),
        threading.Thread(target=_scapy_sniff,     daemon=True, name="atlas-scapy"),
        threading.Thread(target=_winlog_monitor,  daemon=True, name="atlas-winlog"),
        threading.Thread(target=_fs_watch,        daemon=True, name="atlas-fswatch"),
        threading.Thread(target=_login_monitor,    daemon=True, name="atlas-login"),
        threading.Thread(target=_authlog_monitor, daemon=True, name="atlas-authlog"),
        threading.Thread(target=_topology_monitor, daemon=True, name="atlas-topology"),
        threading.Thread(target=_posture_monitor, daemon=True, name="atlas-posture"),
    ]
    for t in threads:
        t.start()

    # Give scapy thread a moment to confirm it can actually sniff
    time.sleep(1)
    scapy_status = "ON" if _SCAPY_LIVE else "OFF (install Npcap + run as Admin)"
    watchdog_dirs = [d for d in WATCH_DIRS if _dir_accessible(d)]
    watchdog_status = f"ON ({len(watchdog_dirs)} dirs)" if watchdog_dirs else "OFF (no accessible dirs)"

    print(f"[ATLAS] ✓ Real capture — {MY_HOSTNAME} ({MY_IP})")
    print(f"[ATLAS] ✓ Scapy:    {scapy_status}")
    print(f"[ATLAS] ✓ WinLog:   {'ON' if WIN32_OK   else 'OFF (run as Admin)'}")
    print(f"[ATLAS] ✓ Watchdog: {watchdog_status}")
    print(f"[ATLAS] ✓ Topology: ON (60s)")
    print(f"[ATLAS] ✓ Posture:  ON (5min)")
    print(f"[ATLAS] ✗ Simulation: DISABLED")
    return threads


def get_real_event(timeout: float = 5.0):
    try:
        return event_queue.get(timeout=timeout)
    except Empty:
        return None
