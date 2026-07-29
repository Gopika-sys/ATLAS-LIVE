import json
import re
from app.llm.clients import fast_triage, deep_reasoning
from app.network.machine_profile import get_agent_context_header


class BaseAgent:
    name = "base"
    system_prompt = ""
    use_deep_reasoning = False

    def _full_system_prompt(self) -> str:
        return get_agent_context_header() + "\n" + self.system_prompt

    def run(self, event_context: dict) -> dict:
        prompt = self._build_prompt(event_context)
        llm_fn = deep_reasoning if self.use_deep_reasoning else fast_triage
        for attempt in range(2):
            try:
                raw = llm_fn(prompt, system=self._full_system_prompt())
                result = self._parse(raw)
                if result.get("action") != "error":
                    return result
            except Exception as e:
                if attempt == 1:
                    return {"action": "error", "reasoning": str(e), "severity": "low"}
        return {"action": "error", "reasoning": "Max retries exceeded", "severity": "low"}

    def _build_prompt(self, event_context: dict) -> str:
        return (
            f"Event data:\n{json.dumps(event_context, indent=2)}\n\n"
            f"IMPORTANT: Respond with ONLY a valid JSON object. "
            f"No explanations, no apologies, no markdown. Just the JSON."
        )

    def _parse(self, raw: str) -> dict:
        cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"action": "error", "reasoning": f"Unparseable: {raw[:300]}", "severity": "low"}
