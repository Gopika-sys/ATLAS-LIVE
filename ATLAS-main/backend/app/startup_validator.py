"""
ATLAS Startup Validator
Checks all required environment variables and dependencies before the app boots.
Called once from main.py at startup — raises SystemExit with a clear message on failure.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()


_REQUIRED_ENV = {
    "NVIDIA_API_KEY_SUPER": "NVIDIA NIM API key (get from https://build.nvidia.com)",
    "SUPABASE_URL":         "Supabase project URL (get from https://supabase.com/dashboard)",
    "SUPABASE_SERVICE_KEY": "Supabase service role key (Project Settings → API)",
}

_OPTIONAL_ENV = {
    "NVIDIA_API_KEY_NANO": "Separate Nano model key — falls back to NVIDIA_API_KEY_SUPER if missing",
    "ALLOWED_ORIGINS":     "Comma-separated CORS origins (default: localhost dev ports)",
    "FFMPEG_PATH":         "Absolute path to ffmpeg binary (auto-detected from PATH if missing)",
    "PIPER_PATH":          "Absolute path to piper TTS binary (voice disabled if missing)",
    "PIPER_MODEL":         "Piper voice model name (default: en_US-lessac-medium)",
}


def _check_env() -> list[str]:
    errors = []
    for key, description in _REQUIRED_ENV.items():
        if not os.environ.get(key, "").strip():
            errors.append(f"  ✗ {key} — {description}")
    return errors


def _check_supabase() -> list[str]:
    errors = []
    try:
        from app.db.writer import supabase
        # Lightweight ping — just check the connection works
        supabase.table("incidents").select("id").limit(1).execute()
    except Exception as e:
        errors.append(f"  ✗ Supabase connection failed: {e}")
    return errors


def _check_nvidia() -> list[str]:
    errors = []
    try:
        from app.llm.clients import fast_triage
        fast_triage("ping", system="Reply with: ok")
    except Exception as e:
        errors.append(f"  ✗ NVIDIA NIM connection failed: {e}")
    return errors


def _warn_optional():
    missing = [k for k in _OPTIONAL_ENV if not os.environ.get(k, "").strip()]
    if missing:
        print("[ATLAS] Optional env vars not set (non-fatal):")
        for k in missing:
            print(f"  ⚠  {k} — {_OPTIONAL_ENV[k]}")


def validate(check_connections: bool = True):
    """
    Run all startup checks.
    - check_connections=True  : also pings Supabase + NVIDIA (adds ~1-2s to startup)
    - check_connections=False : env-only check (faster, for unit tests)
    Raises SystemExit(1) if any required check fails.
    """
    print("[ATLAS] Running startup validation…")
    errors: list[str] = []

    # 1. Required env vars
    errors += _check_env()

    # 2. Live connection checks (skippable for tests)
    if check_connections and not errors:
        errors += _check_supabase()
        errors += _check_nvidia()

    if errors:
        print("\n[ATLAS] ✗ Startup validation FAILED — fix the following:\n")
        for e in errors:
            print(e)
        print(
            "\nSee docs/SETUP.md for configuration instructions.\n"
            "Set the missing values in your .env file and restart.\n"
        )
        sys.exit(1)

    _warn_optional()
    print("[ATLAS] ✓ Startup validation passed.\n")
