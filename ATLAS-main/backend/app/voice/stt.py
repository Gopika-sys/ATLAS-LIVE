import os
import shutil
import numpy as np
from subprocess import run, CalledProcessError
from dotenv import load_dotenv
import whisper
import whisper.audio

load_dotenv()



def _find_ffmpeg() -> str:
    """Resolve ffmpeg: env var → PATH → common Windows install path."""
    env = os.environ.get("FFMPEG_PATH")
    if env and os.path.isfile(env):
        return env
    in_path = shutil.which("ffmpeg")
    if in_path:
        return in_path
    fallback = r"C:\ffmpeg\ffmpeg.exe"
    if os.path.isfile(fallback):
        return fallback
    raise RuntimeError(
        "ffmpeg not found. Install it and add to PATH, or set FFMPEG_PATH in .env"
    )


_FFMPEG_EXE = _find_ffmpeg()


def _patched_load_audio(file: str, sr: int = whisper.audio.SAMPLE_RATE):
    cmd = [
        _FFMPEG_EXE, "-nostdin", "-threads", "0",
        "-i", file, "-f", "s16le", "-ac", "1",
        "-acodec", "pcm_s16le", "-ar", str(sr), "-"
    ]
    try:
        out = run(cmd, capture_output=True, check=True).stdout
    except CalledProcessError as e:
        raise RuntimeError(f"Failed to load audio: {e.stderr.decode()}") from e
    return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0


whisper.audio.load_audio = _patched_load_audio

model = whisper.load_model("small")


def transcribe(audio_path: str) -> str:
    result = model.transcribe(audio_path)
    return result["text"].strip()
