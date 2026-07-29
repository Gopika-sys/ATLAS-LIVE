import asyncio
import json
import os
import threading
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.api.voice import router as voice_router
from app.api.dashboard import router as dashboard_router
from app.api.network import router as network_router
from app.api.login import router as login_router
from app.startup_validator import validate

load_dotenv()
validate()

app = FastAPI(title="ATLAS Backend")

# ── API key auth ──────────────────────────────────────────────────────────────
# Set ATLAS_API_KEY in .env to enable. If not set, auth is skipped (dev mode).
_API_KEY = os.environ.get("ATLAS_API_KEY", "").strip()

_UNPROTECTED = {"/health", "/ws", "/voice/audio", "/docs", "/openapi.json"}

@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    if _API_KEY and request.url.path not in _UNPROTECTED:
        key = request.headers.get("X-API-Key", "")
        if key != _API_KEY:
            return JSONResponse(status_code=401, content={"error": "Unauthorized — invalid or missing X-API-Key"})
    return await call_next(request)

# CORS: restrict to configured origins in production; default to localhost dev ports
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
_ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(voice_router)
app.include_router(dashboard_router)
app.include_router(network_router)
app.include_router(login_router)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)

    def disconnect(self, ws: WebSocket):
        self.active.remove(ws)

    async def broadcast(self, data: dict):
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.active.remove(ws)

manager = ConnectionManager()

# Expose broadcast so dashboard.py can push state updates
async def _broadcast(data: dict):
    await manager.broadcast(data)

def broadcast_state_update(extra: dict | None = None):
    """Fire-and-forget state_update push from sync context (e.g. API handlers)."""
    _broadcast_sync({"type": "state_update", **(extra or {})})


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)


_main_loop: asyncio.AbstractEventLoop | None = None


def _broadcast_sync(data: dict):
    """Thread-safe broadcast onto the main event loop."""
    if _main_loop and _main_loop.is_running():
        asyncio.run_coroutine_threadsafe(manager.broadcast(data), _main_loop)


def _run_pipeline():
    from app.network.capture import start_collectors, get_real_event
    from app.ml.score_event import score_event, _MY_HOSTNAME
    from app.graph.master_graph import run_atlas
    import time

    start_collectors()

    while True:
        try:
            event = get_real_event(timeout=10.0)

            if event is None:
                _broadcast_sync({"type": "heartbeat"})
                continue

            scored = score_event(event)
            if not scored["is_anomaly"]:
                print(f"[ATLAS] skip (normal): {scored['type']}")
                continue

            # Hard guard — never process events from other machines
            if scored.get("hostname", _MY_HOSTNAME) != _MY_HOSTNAME:
                print(f"[ATLAS] skip (foreign host): {scored.get('hostname')}")
                continue

            print(f"[ATLAS] REAL EVENT: {scored['type']} | {scored['severity']} | {scored.get('source_ip','?')}")
            result = run_atlas(scored)
            payload = {
                "type":              "event",
                "event":             scored,
                "response":          result.get("final_response", ""),
                "severity":          scored.get("severity", "low"),
                "requires_approval": result.get("requires_approval", False),
                "incident_id":       result.get("incident_id"),
            }
            _broadcast_sync(payload)
        except (KeyboardInterrupt, SystemExit):
            break
        except Exception as e:
            print(f"[pipeline error] {e}")
            time.sleep(1)


@app.on_event("startup")
async def startup():
    global _main_loop
    _main_loop = asyncio.get_running_loop()
    t = threading.Thread(target=_run_pipeline, daemon=True)
    t.start()
    print("[ATLAS] Pipeline thread started.")


@app.get("/health")
def health():
    return {"status": "ok", "service": "atlas-backend"}
