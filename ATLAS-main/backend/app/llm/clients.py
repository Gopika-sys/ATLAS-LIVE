import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Single client using the Super key — works for both models
_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ["NVIDIA_API_KEY_SUPER"],
    timeout=30.0,
    max_retries=1,
)

NANO_MODEL  = "meta/llama-3.1-8b-instruct"
SUPER_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1"


def fast_triage(prompt: str, system: str = "") -> str:
    """Nemotron Nano 8B — fast per-event classification and intent detection."""
    messages = []
    sys_content = system or "You are a JSON-only security classifier. Always respond with valid JSON only. No explanations, no apologies, no markdown."
    messages.append({"role": "system", "content": sys_content})
    messages.append({"role": "user", "content": prompt})
    resp = _client.chat.completions.create(
        model=NANO_MODEL,
        messages=messages,
        temperature=0.1,
        max_tokens=1024,
    )
    return resp.choices[0].message.content


def deep_reasoning(prompt: str, system: str = "") -> str:
    """Nemotron Super 49B — deep chain-of-thought for incident decisions and forensics."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    resp = _client.chat.completions.create(
        model=SUPER_MODEL,
        messages=messages,
        temperature=0.1,
        max_tokens=2048,
    )
    return resp.choices[0].message.content


def voice_synthesis(prompt: str) -> str:
    """Nemotron Nano 8B — JARVIS-style spoken response generation."""
    resp = _client.chat.completions.create(
        model=NANO_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are ATLAS, an AI Security Commander. "
                    "Convert the security finding into a calm, confident 1-2 sentence spoken response. "
                    "Sound like JARVIS from Iron Man. No jargon. Direct. Authoritative."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=150,
    )
    return resp.choices[0].message.content
