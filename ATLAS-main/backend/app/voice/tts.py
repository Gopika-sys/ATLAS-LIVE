import subprocess
import tempfile
import shutil
import os


def _find_piper() -> str | None:
    """Resolve piper binary: env var → PATH → None (fallback to text-only)."""
    env = os.environ.get("PIPER_PATH")
    if env and os.path.isfile(env):
        return env
    return shutil.which("piper")


def _find_model() -> str:
    """Resolve piper voice model: env var → default name."""
    return os.environ.get("PIPER_MODEL", "en_US-lessac-medium")


def speak(text: str, output_path: str = None) -> str:
    if output_path is None:
        output_path = os.path.join(tempfile.gettempdir(), "atlas_response.wav")

    piper = _find_piper()
    if piper is None:
        # Piper not installed — write a silent placeholder so callers don’t crash
        open(output_path, "wb").close()
        return output_path

    subprocess.run(
        [piper, "--model", _find_model(), "--output_file", output_path],
        input=text.encode(),
        check=True,
    )
    return output_path