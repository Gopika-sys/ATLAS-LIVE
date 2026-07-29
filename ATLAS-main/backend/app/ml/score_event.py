"""
ATLAS Event Scorer — real events only.
Rule engine is primary. ML model is secondary and only upgrades, never creates anomalies alone.
"""
import socket
from app.ml.model import predict

_MY_HOSTNAME = socket.gethostname()
_SEVERITY_ORDER = ["low", "medium", "high", "critical"]

def _escalate(s: str) -> str:
    i = _SEVERITY_ORDER.index(s) if s in _SEVERITY_ORDER else 0
    return _SEVERITY_ORDER[min(i + 1, 3)]

# Rule: (severity, is_anomaly)
_RULES = {
    "brute_force":          lambda e: ("high",     True) if e.get("failed_logins", 0) > 10
                                 else ("medium",   True) if e.get("failed_logins", 0) >= 5
                                 else ("medium",   True) if e.get("after_hours")
                                 else ("low",      False),

    # topology collector sets ports_scanned=1 for new listeners — not a real scan
    "port_scan":            lambda e: ("high",     True) if e.get("ports_scanned", 0) > 100
                                 else ("medium",   True) if e.get("ports_scanned", 0) > 50
                                 else ("low",      False),   # <50 = topology noise, skip

    "ddos":                 lambda e: ("critical", True) if e.get("requests_per_sec", 0) > 500
                                 else ("medium",   True),
    "sql_injection":        lambda e: ("high",     True),
    "phishing":             lambda e: ("high",     True),
    "malware":              lambda e: ("critical", True),
    "xss":                  lambda e: ("medium",   True),
    "reverse_shell":        lambda e: ("critical", True),
    "privilege_escalation": lambda e: ("critical", True),
    "insider_threat":       lambda e: ("high",     True),
    "data_exfiltration":    lambda e: ("high",     True),

    # Only flag weak_password if password_score field is explicitly present and low
    "weak_password":        lambda e: ("medium",   True) if "password_score" in e and e["password_score"] < 3
                                 else ("low",      False),

    # security_posture: only anomaly if from THIS machine and severity is medium or higher
    "security_posture":     lambda e: (e.get("severity", "medium"), True)
                                 if e.get("hostname", "") == _MY_HOSTNAME
                                 and e.get("severity", "medium") in ("medium", "high", "critical")
                                 else ("low", False),

    "normal":               lambda e: ("low",      False),
}


def score_event(event: dict) -> dict:
    # Reject any event not from real capture
    if event.get("source") not in ("real_capture", None):
        event["severity"]   = "low"
        event["is_anomaly"] = False
        return event

    # Reject events from any machine other than this laptop
    event_host = event.get("hostname", "") or event.get("machine", {}).get("hostname", "")
    if event_host and event_host != _MY_HOSTNAME:
        event["severity"]   = "low"
        event["is_anomaly"] = False
        return event

    etype = event.get("type", "normal")
    rule  = _RULES.get(etype, lambda e: ("medium", True))
    severity, is_anomaly = rule(event)

    # Machine-aware escalation
    machine = event.get("machine", {})
    if machine and is_anomaly:
        known_ports  = set(machine.get("open_ports", []))
        firewall_off = not machine.get("firewall_on", True)

        targeted  = event.get("targeted_known_ports", [])
        dest_port = event.get("destination_port") or event.get("new_port")
        if targeted or (dest_port and dest_port in known_ports):
            severity = _escalate(severity)

        if firewall_off and etype in ("port_scan", "ddos", "reverse_shell", "brute_force"):
            severity = _escalate(severity)

    # ML model — only upgrades severity if event already has real numeric features
    if is_anomaly:
        try:
            features = {
                "duration":      event.get("duration_sec", 0),
                "src_bytes":     event.get("data_volume_mb", 0) * 1024,
                "dst_bytes":     0,
                "failed_logins": event.get("failed_logins", 0),
                "count":         event.get("ports_scanned",
                                 event.get("requests_per_sec", 0)),
                "protocol_type": event.get("protocol", "tcp").lower()[:3],
                "service":       "http",
                "flag":          "SF",
            }
            has_signal = any([
                features["failed_logins"] > 0,
                features["count"] > 0,
                features["src_bytes"] > 0,
            ])
            if has_signal:
                ml = predict(features)
                if ml["anomaly"] and severity == "low":
                    severity = "medium"
        except Exception:
            pass

    event["severity"]   = severity
    event["is_anomaly"] = is_anomaly
    event["data_source"] = "real_capture"   # tag every scored event

    if "source_ip" not in event:
        event["source_ip"] = event.get("hostname", "unknown")

    return event
