import json
import urllib.error
import urllib.request
from typing import Dict, List

from .config import resolve_provider
from .providers import build_chat_payload, build_messages_payload, chat_completions_url, messages_url


class LLMError(RuntimeError):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def _extract_error_message(raw: str, status: int) -> str:
    """Pull a human-readable message out of a provider error body."""
    text = (raw or "").strip()
    if not text:
        return f"HTTP {status}"
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return text[:800]

    if isinstance(data, dict):
        error = data.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str) and error:
            return error
        if data.get("message"):
            return str(data["message"])
        if data.get("detail"):
            return str(data["detail"])
    return text[:800]


def _post_json(url: str, headers: Dict[str, str], body: Dict):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        message = _extract_error_message(detail, error.code)
        # Surface auth/rate-limit problems as-is so the UI can explain them,
        # but keep genuine upstream 4xx codes intact for debugging.
        if error.code in (401, 403):
            message = f"Authentication failed ({error.code}): {message}"
        elif error.code == 429:
            message = f"Rate limited (429): {message}"
        status = 500 if error.code in (401, 403, 429) else error.code
        raise LLMError(message, status)
    except urllib.error.URLError as error:
        raise LLMError(f"Could not reach {url}: {error.reason}", 500)


def call_llm(system_prompt: str, user_prompt: str, temperature: float = 0.3, max_tokens: int = 8192) -> str:
    info = resolve_provider()
    if not info:
        raise LLMError(
            "No API key configured. Please set your API key in Settings, or configure "
            "ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY in the .env file.",
            500,
        )

    return call_llm_with_info(info, system_prompt, user_prompt, temperature, max_tokens)


def call_llm_with_info(info, system_prompt: str, user_prompt: str, temperature: float = 0.3, max_tokens: int = 8192) -> str:
    """Call a model using an explicit configuration without changing runtime state."""
    # Anthropic uses its own Messages API; everything else is OpenAI-compatible.
    if info.api_style == "anthropic":
        return _call_anthropic(info, system_prompt, user_prompt, temperature, max_tokens)

    return _call_openai_compatible(info, system_prompt, user_prompt, temperature, max_tokens)


def _call_openai_compatible(info, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    payload = build_chat_payload(
        info.model, system_prompt, user_prompt, temperature, max_tokens, info.provider
    )
    headers = {
        "Authorization": f"Bearer {info.api_key}",
        "Content-Type": "application/json",
    }
    response = _post_json(chat_completions_url(info.base_url, info.provider), headers, payload)

    if isinstance(response, dict) and response.get("error"):
        raise LLMError(_extract_error_message(json.dumps(response), 500), 500)

    choices: List[Dict] = response.get("choices") or []
    if not choices:
        fields = ", ".join(sorted(response.keys())) if isinstance(response, dict) else type(response).__name__
        raise LLMError(f"The model returned no choices (response fields: {fields or 'none'}).", 502)
    message = choices[0].get("message") or {}
    content = message.get("content")
    # Reasoning models may return content as a list of blocks rather than a
    # plain string; normalise both shapes.
    if isinstance(content, list):
        content = "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") in (None, "text")
        )
    if not isinstance(content, str) or not content.strip():
        finish_reason = choices[0].get("finish_reason") or "unknown"
        message_fields = ", ".join(sorted(message.keys())) if isinstance(message, dict) else "none"
        if finish_reason == "length":
            raise LLMError(
                "The model used the output limit before producing a final answer. "
                "Thinking mode may still be enabled by the upstream service.",
                502,
            )
        raise LLMError(
            f"The model returned an empty answer (finish_reason={finish_reason}; "
            f"message fields: {message_fields or 'none'}).",
            502,
        )
    return content


def _call_anthropic(info, system_prompt: str, user_prompt: str, temperature: float, max_tokens: int) -> str:
    payload = build_messages_payload(
        info.model, system_prompt, user_prompt, temperature, max_tokens, info.provider
    )
    headers = {
        "x-api-key": info.api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    response = _post_json(messages_url(info.base_url, info.provider), headers, payload)

    if isinstance(response, dict) and response.get("error"):
        raise LLMError(_extract_error_message(json.dumps(response), 500), 500)

    content = "".join(
        block.get("text", "")
        for block in (response.get("content") or [])
        if isinstance(block, dict) and block.get("type") == "text"
    )
    if not content.strip():
        stop_reason = response.get("stop_reason") or "unknown"
        block_types = [
            str(block.get("type"))
            for block in (response.get("content") or [])
            if isinstance(block, dict)
        ]
        raise LLMError(
            f"The model returned no text (stop_reason={stop_reason}; "
            f"content block types: {', '.join(block_types) or 'none'}).",
            502,
        )
    return content
