import json
import urllib.error
import urllib.request
from typing import Dict, List

from .config import resolve_provider


class LLMError(RuntimeError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def _post_json(url: str, headers: Dict[str, str], body: Dict):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        status = 500 if error.code in (401, 403, 429) else error.code
        raise LLMError(detail or error.reason, status)
    except urllib.error.URLError as error:
        raise LLMError(str(error.reason), 500)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3, max_tokens: int = 8192) -> str:
    info = resolve_provider()
    if not info:
        raise LLMError(
            "No API key configured. Please set ANTHROPIC_API_KEY or DEEPSEEK_API_KEY in your .env file.",
            500,
        )

    if info.provider == "deepseek":
        return _call_openai_compatible(info.base_url, info.api_key, info.model, system_prompt, user_prompt, temperature, max_tokens)

    return _call_anthropic(info.api_key, info.model, system_prompt, user_prompt, temperature, max_tokens)


def _call_openai_compatible(base_url: str, api_key: str, model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    response = _post_json(
        f"{base_url.rstrip('/')}/chat/completions",
        {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        {
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        },
    )
    choices: List[Dict] = response.get("choices", [])
    if not choices:
        return ""
    return choices[0].get("message", {}).get("content", "") or ""


def _call_anthropic(api_key: str, model: str, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    response = _post_json(
        "https://api.anthropic.com/v1/messages",
        {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        },
    )
    return "".join(block.get("text", "") for block in response.get("content", []) if block.get("type") == "text")
