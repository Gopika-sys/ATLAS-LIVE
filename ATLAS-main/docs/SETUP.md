# ATLAS — Setup & Run Guide

## 1. Configure Environment Variables

Copy the template and fill in your keys:

```
NVIDIA_API_KEY_SUPER=nvapi-...   # Required — deep reasoning (Nemotron Super 49B)
NVIDIA_API_KEY_NANO=nvapi-...    # Optional — falls back to SUPER key if missing
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# CORS — comma-separated allowed frontend origins (default: localhost dev ports)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Optional API key to protect all endpoints (leave blank to disable in dev)
ATLAS_API_KEY=

# Voice — auto-detected from PATH if not set
# FFMPEG_PATH=C:\ffmpeg\ffmpeg.exe
# PIPER_PATH=C:\piper\piper.exe
# PIPER_MODEL=en_US-lessac-medium

# Voice rate limiting (default: 5 requests per 60 seconds per IP)
# VOICE_RATE_LIMIT=5
# VOICE_RATE_WINDOW=60
```

### Get your NVIDIA API Key
1. Go to https://build.nvidia.com
2. Sign in → top right → "Get API Key"
3. Copy the key (starts with `nvapi-...`)

---

## 2. Run the Supabase Schema

1. Go to https://supabase.com/dashboard
2. Open your project → SQL Editor
3. Paste and run `docs/schema.sql`

---

## 3. Install Voice Dependencies (Optional)

**ffmpeg** — required for Whisper STT:
- Windows: download from https://ffmpeg.org/download.html, add to PATH or set `FFMPEG_PATH`
- Linux/macOS: `apt install ffmpeg` / `brew install ffmpeg`

**Piper TTS** — required for spoken responses:
- Download from https://github.com/rhasspy/piper/releases
- Add to PATH or set `PIPER_PATH`
- If not installed, ATLAS still works — voice responses are text-only

---

## 4. Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

---

## 5. Start the Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

ATLAS runs a startup validator on boot — it will print clear errors if any required
env vars or connections are missing before the server starts.

---

## 6. Install & Start Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## 7. Open ATLAS

Navigate to http://localhost:5173

---

## Architecture

```
Real Network Traffic (psutil / Scapy / WinEventLog / Watchdog)
        ↓
ML Anomaly Scoring (Isolation Forest — NSL-KDD trained)
        ↓
LangGraph Master Graph
  ├── Triage Node       — rule-based agent selection + memory escalation
  ├── Agent Execution   — up to 14 agents in parallel (ThreadPoolExecutor)
  │     ├── FirewallAgent          ├── LoginMonitorAgent
  │     ├── ThreatIntelAgent       ├── NetworkMonitorAgent
  │     ├── MalwareDetectionAgent  ├── ForensicsAgent
  │     ├── PhishingDetectionAgent ├── InsiderThreatAgent
  │     ├── PasswordSecurityAgent  ├── IncidentResponseAgent
  │     ├── LogAnalysisAgent       ├── ReportGenerationAgent
  │     ├── VoiceAssistantAgent    └── DecisionMakingAgent
  ├── Decision Node     — Nemotron Super 49B deep reasoning
  └── Respond Node      — executes actions + TTS + memory storage
        ↓
Supabase (events, incidents, agent_actions, decision_log, atlas_memory)
        ↓
WebSocket broadcast → React Dashboard (live)
        ↓
Piper TTS → Voice Output
```

---

## NVIDIA Models

| Model | Role |
|-------|------|
| `nvidia/llama-3.1-nemotron-nano-8b-v1` | Fast triage, intent classification, voice synthesis |
| `nvidia/llama-3.3-nemotron-super-49b-v1` | Deep reasoning, decisions, forensics, reports |

---

## Key Features

- **Real capture only** — 7 collectors: psutil, Scapy, Windows Event Log, Watchdog, auth.log, topology, posture
- **Parallel agent execution** — all selected agents run concurrently
- **Memory system** — ATLAS learns from every incident; repeat offender IPs auto-blocked
- **MITRE ATT&CK mapping** — threat intel and forensics agents map to ATT&CK techniques
- **Approval workflow** — high-risk actions (`block_ip`, `isolate_machine`, etc.) require operator approval
- **Full voice loop** — Whisper STT → NVIDIA NIM intent → Piper TTS
- **MCP server** — expose ATLAS tools to Claude Desktop / Cursor via `app/mcp_servers/atlas_mcp_server.py`
- **API key auth** — set `ATLAS_API_KEY` in `.env` to protect all endpoints
- **Rate limiting** — `/voice` endpoint limited to 5 req/60s per IP (configurable)

---

## MCP Server (Claude Desktop / Cursor)

Run as a stdio server:

```bash
cd backend
python -m app.mcp_servers.atlas_mcp_server
```

Available tools: `get_status`, `get_incidents`, `get_agent_actions`,
`run_threat_analysis`, `block_ip`, `get_memory_stats`

---

## Executor Actions

| Action | What it does | Requires Approval |
|--------|-------------|-------------------|
| `block_ip` | Adds firewall rule to block IP (in + out) | Yes |
| `lock_account` | Disables local user account | Yes |
| `kill_process` | Terminates process by PID | No |
| `quarantine_file` | Moves file to `C:\ATLAS_Quarantine` | Yes |
| `isolate_machine` | Sets firewall to block all traffic except loopback | Yes |
| `disable_session` | Logs off all active sessions for a user | Yes |
| `force_reset` | Forces password reset on next login | Yes |
