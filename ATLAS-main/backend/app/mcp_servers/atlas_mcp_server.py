"""
ATLAS MCP Server — exposes ATLAS security tools via Model Context Protocol.

Tools exposed:
  - get_status          : current threat level + open incident count
  - get_incidents       : list recent incidents (filterable by severity)
  - get_agent_actions   : recent actions taken by a specific agent
  - run_threat_analysis : push a synthetic event through the full ATLAS pipeline
  - block_ip            : immediately block an IP via the executor
  - get_memory_stats    : recurring threats + top offender IPs from atlas_memory

Run standalone:
    python -m app.mcp_servers.atlas_mcp_server

Or register in an MCP-compatible host (Claude Desktop, Cursor, etc.) by pointing
to this file as a stdio server.
"""

import json
import sys
import os
from typing import Any

# Allow running from repo root without installing the package
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from dotenv import load_dotenv
load_dotenv()

from app.db.writer import supabase
from app.actions.executor import block_ip as _block_ip
from app.graph.master_graph import run_atlas
from app.memory.atlas_memory import get_threat_pattern, get_ip_pattern


# ── MCP wire protocol helpers ─────────────────────────────────────────────────

def _send(obj: dict):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def _error(id_, code: int, message: str):
    _send({"jsonrpc": "2.0", "id": id_, "error": {"code": code, "message": message}})


def _result(id_, data: Any):
    _send({"jsonrpc": "2.0", "id": id_, "result": data})


# ── Tool implementations ──────────────────────────────────────────────────────

def tool_get_status() -> dict:
    incidents = supabase.table("incidents").select("severity, status") \
        .eq("status", "open").execute().data or []
    severities = [i["severity"] for i in incidents]
    level = (
        "critical" if "critical" in severities else
        "high"     if "high"     in severities else
        "medium"   if "medium"   in severities else
        "low"
    )
    return {
        "threat_level":   level,
        "open_incidents": len(incidents),
        "severity_breakdown": {
            "critical": severities.count("critical"),
            "high":     severities.count("high"),
            "medium":   severities.count("medium"),
            "low":      severities.count("low"),
        },
    }


def tool_get_incidents(severity: str = None, limit: int = 10) -> list:
    q = supabase.table("incidents").select("*").order("created_at", desc=True).limit(limit)
    if severity:
        q = q.eq("severity", severity)
    return q.execute().data or []


def tool_get_agent_actions(agent_name: str, limit: int = 20) -> list:
    rows = supabase.table("agent_actions").select("*") \
        .eq("agent_name", agent_name) \
        .order("ts", desc=True) \
        .limit(limit) \
        .execute().data or []
    return [
        r for r in rows
        if isinstance(r.get("params"), dict)
        and r["params"].get("data_source") == "real_capture"
    ]


def tool_run_threat_analysis(event_type: str, source_ip: str = "unknown",
                              severity: str = "medium") -> dict:
    event = {
        "type":      event_type,
        "source_ip": source_ip,
        "severity":  severity,
        "source":    "mcp_trigger",
    }
    result = run_atlas(event)
    return {
        "final_response":    result.get("final_response", ""),
        "overall_threat":    result.get("overall_threat", severity),
        "requires_approval": result.get("requires_approval", False),
        "incident_id":       result.get("incident_id"),
    }


def tool_block_ip(ip: str) -> dict:
    return _block_ip(ip)


def tool_get_memory_stats() -> dict:
    rows = supabase.table("atlas_memory") \
        .select("event_type, severity, source_ip").execute().data or []
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
        "top_offender_ips":  [{"ip": ip, "count": c} for ip, c in top_ips],
    }


# ── Tool registry ─────────────────────────────────────────────────────────────

TOOLS = {
    "get_status": {
        "description": "Get current ATLAS threat level and open incident count.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda args: tool_get_status(),
    },
    "get_incidents": {
        "description": "List recent security incidents. Optionally filter by severity (low/medium/high/critical).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "limit":    {"type": "integer", "default": 10},
            },
            "required": [],
        },
        "fn": lambda args: tool_get_incidents(
            severity=args.get("severity"),
            limit=int(args.get("limit", 10)),
        ),
    },
    "get_agent_actions": {
        "description": "Get recent actions taken by a named ATLAS agent.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string"},
                "limit":      {"type": "integer", "default": 20},
            },
            "required": ["agent_name"],
        },
        "fn": lambda args: tool_get_agent_actions(
            agent_name=args["agent_name"],
            limit=int(args.get("limit", 20)),
        ),
    },
    "run_threat_analysis": {
        "description": "Push a threat event through the full ATLAS multi-agent pipeline and get a decision.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "event_type": {"type": "string"},
                "source_ip":  {"type": "string"},
                "severity":   {"type": "string", "enum": ["low", "medium", "high", "critical"]},
            },
            "required": ["event_type"],
        },
        "fn": lambda args: tool_run_threat_analysis(
            event_type=args["event_type"],
            source_ip=args.get("source_ip", "unknown"),
            severity=args.get("severity", "medium"),
        ),
    },
    "block_ip": {
        "description": "Immediately block an IP address via the system firewall.",
        "inputSchema": {
            "type": "object",
            "properties": {"ip": {"type": "string"}},
            "required": ["ip"],
        },
        "fn": lambda args: tool_block_ip(args["ip"]),
    },
    "get_memory_stats": {
        "description": "Get ATLAS memory stats: recurring threats and top offender IPs.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
        "fn": lambda args: tool_get_memory_stats(),
    },
}


# ── MCP request dispatcher ────────────────────────────────────────────────────

def _handle(req: dict):
    method = req.get("method", "")
    id_    = req.get("id")

    if method == "initialize":
        _result(id_, {
            "protocolVersion": "2024-11-05",
            "capabilities":    {"tools": {}},
            "serverInfo":      {"name": "atlas-mcp-server", "version": "1.0.0"},
        })

    elif method == "tools/list":
        _result(id_, {"tools": [
            {"name": name, "description": meta["description"], "inputSchema": meta["inputSchema"]}
            for name, meta in TOOLS.items()
        ]})

    elif method == "tools/call":
        params    = req.get("params", {})
        tool_name = params.get("name", "")
        args      = params.get("arguments", {})
        tool      = TOOLS.get(tool_name)
        if not tool:
            _error(id_, -32601, f"Unknown tool: {tool_name}")
            return
        try:
            data = tool["fn"](args)
            _result(id_, {
                "content": [{"type": "text", "text": json.dumps(data, indent=2, default=str)}]
            })
        except Exception as e:
            _error(id_, -32603, str(e))

    elif method == "notifications/initialized":
        pass  # no response needed

    else:
        _error(id_, -32601, f"Method not found: {method}")


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        _handle(req)


if __name__ == "__main__":
    main()
