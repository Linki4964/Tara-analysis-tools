"""Offline verification of the multi-provider API configuration.

Runs without network or third-party dependencies. Intercepts the HTTP layer so
we can assert on the exact URL, headers and JSON body each provider receives.

Run:  python scripts/verify_api_config.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tara_core import llm  # noqa: E402
from tara_core import config as cfg  # noqa: E402
from tara_core.providers import (  # noqa: E402
    build_chat_payload,
    build_messages_payload,
    chat_completions_url,
    describe_providers,
    detect_provider_from_key,
    is_masked_key,
    is_placeholder_key,
    mask_key,
    max_tokens_field,
    messages_url,
    supports_temperature,
)

failures: list[str] = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        print(f"         got : {got!r}")
        print(f"         want: {want!r}")
        failures.append(label)


def section(title):
    print(f"\n=== {title} ===")


# ---------------------------------------------------------------- base URLs
section("Base URL normalisation (the /v1 404 bug)")

check(
    "OpenAI base without /v1 gets /v1 appended",
    chat_completions_url("https://api.openai.com", "openai"),
    "https://api.openai.com/v1/chat/completions",
)
check(
    "OpenAI base with /v1 is not doubled",
    chat_completions_url("https://api.openai.com/v1", "openai"),
    "https://api.openai.com/v1/chat/completions",
)
check(
    "trailing slash tolerated",
    chat_completions_url("https://api.openai.com/v1/", "openai"),
    "https://api.openai.com/v1/chat/completions",
)
check(
    "pasted full endpoint is reduced to base",
    chat_completions_url("https://api.openai.com/v1/chat/completions", "openai"),
    "https://api.openai.com/v1/chat/completions",
)
check(
    "DeepSeek keeps the documented root form (no /v1)",
    chat_completions_url("https://api.deepseek.com", "deepseek"),
    "https://api.deepseek.com/chat/completions",
)
check(
    "DeepSeek tolerates a pasted endpoint",
    chat_completions_url("https://api.deepseek.com/chat/completions", "deepseek"),
    "https://api.deepseek.com/chat/completions",
)
check(
    "Ollama local endpoint",
    chat_completions_url("http://localhost:11434/v1", "local"),
    "http://localhost:11434/v1/chat/completions",
)
check(
    "Anthropic messages endpoint",
    messages_url("https://api.anthropic.com", "anthropic"),
    "https://api.anthropic.com/v1/messages",
)
check(
    "Anthropic CUSTOM base is honoured (was hardcoded before)",
    messages_url("https://my-proxy.internal", "anthropic"),
    "https://my-proxy.internal/v1/messages",
)
check(
    "Anthropic custom base that already has /v1",
    messages_url("https://my-proxy.internal/v1", "anthropic"),
    "https://my-proxy.internal/v1/messages",
)

# --------------------------------------------------------- key detection
section("Key prefix detection")

check("anthropic key", detect_provider_from_key("sk-ant-api03-abc"), "anthropic")
check("openai project key", detect_provider_from_key("sk-proj-abc"), "openai")
check(
    "bare sk- is ambiguous -> None (never guess; would leak key to wrong vendor)",
    detect_provider_from_key("sk-1234567890"),
    None,
)
check("placeholder key is not a provider", detect_provider_from_key("your-deepseek-api-key"), None)
check("placeholder detection", is_placeholder_key("your-openai-api-key"), True)
check("real key is not a placeholder", is_placeholder_key("sk-proj-real123"), False)

# --------------------------------------------------------------- masking
section("Key masking round-trip (prevents destroying a stored key)")

real = "sk-proj-abcdefghijklmnop"
masked = mask_key(real)
check("masked value detected as a mask", is_masked_key(masked), True)
check("real value not treated as a mask", is_masked_key(real), False)
check("deepseek-style real key not treated as a mask", is_masked_key("sk-1234567890abcdef"), False)

# ------------------------------------------------------------- payloads
section("Request payloads (max_tokens / max_completion_tokens / temperature)")

check("gpt-4o uses max_tokens + temperature", (
    lambda b: ("max_tokens" in b, "temperature" in b)
)(build_chat_payload("gpt-4o", "s", "u", 0.3, 100, "openai")), (True, True))

check("o3-mini omits temperature and uses max_completion_tokens", (
    lambda b: ("temperature" in b, "max_completion_tokens" in b, "max_tokens" in b)
)(build_chat_payload("o3-mini", "s", "u", 0.3, 100, "openai")), (False, True, False))

check("gpt-5 uses max_completion_tokens", max_tokens_field("gpt-5", "openai"), "max_completion_tokens")
check("gpt-4o supports temperature", supports_temperature("gpt-4o", "openai"), True)
check("o1 rejects temperature", supports_temperature("o1-preview", "openai"), False)

# DeepSeek thinking mode is ON by default and ignores temperature, so it is omitted.
check("deepseek-flash omits temperature (thinking mode default)", (
    lambda b: ("temperature" in b, b.get("max_tokens"))
)(build_chat_payload("deepseek-flash", "s", "u", 0.3, 100, "deepseek")), (False, 100))
check(
    "deepseek keeps max_tokens (never max_completion_tokens)",
    max_tokens_field("deepseek-flash", "deepseek"),
    "max_tokens",
)
check(
    "retired deepseek-chat name still behaves consistently",
    max_tokens_field("deepseek-chat", "deepseek"),
    "max_tokens",
)
check("claude supports temperature", supports_temperature("claude-sonnet-4-6", "anthropic"), True)
check(
    "qwen JSON calls explicitly disable thinking",
    build_chat_payload("qwen3.5-plus", "s", "u", 0.2, 100, "local").get("enable_thinking"),
    False,
)
check(
    "non-qwen models do not receive qwen-only parameter",
    "enable_thinking" in build_chat_payload("gpt-4o", "s", "u", 0.2, 100, "openai"),
    False,
)
check(
    "qwen via anthropic protocol disables thinking",
    build_messages_payload("qwen3.8-flash", "s", "u", 0.2, 100, "anthropic").get("thinking"),
    {"type": "disabled"},
)
check(
    "claude does not receive qwen thinking parameter",
    "thinking" in build_messages_payload("claude-sonnet-4-6", "s", "u", 0.2, 100, "anthropic"),
    False,
)

# --------------------------------------------------------------- catalog
section("Provider catalog")

catalog = {p["name"]: p for p in describe_providers()}
check("four providers exposed", sorted(catalog), ["anthropic", "deepseek", "local", "openai"])
check("deepseek default model is the current one", catalog["deepseek"]["defaultModel"], "deepseek-flash")
check(
    "deepseek default is NOT the retired deepseek-chat",
    catalog["deepseek"]["defaultModel"] != "deepseek-chat",
    True,
)
check(
    "anthropic default is a current Claude id",
    catalog["anthropic"]["defaultModel"],
    "claude-sonnet-4-6",
)
check("openai default base URL includes /v1", catalog["openai"]["defaultBaseUrl"], "https://api.openai.com/v1")
check("anthropic requires a key", catalog["anthropic"]["requiresKey"], True)
check("local needs no key", catalog["local"]["requiresKey"], False)

# --------------------------------------------------------- resolve_provider
section("resolve_provider end-to-end")


def resolved(provider, key, model="", base=""):
    cfg.set_runtime_config(provider, key, model, base)
    info = cfg.resolve_provider()
    cfg.clear_runtime_config()
    return info


i = resolved("openai", "sk-proj-real123")
check("openai provider resolved", i.provider, "openai")
check("openai default model", i.model, "gpt-4o")
check("openai base url normalised", i.base_url, "https://api.openai.com/v1")
check("openai auth style", i.api_style, "openai")

i = resolved("anthropic", "sk-ant-real123", "", "https://my-proxy.internal")
check("anthropic keeps custom base url", i.base_url, "https://my-proxy.internal")
check("anthropic auth style", i.api_style, "anthropic")

i = resolved("deepseek", "sk-real123")
check("deepseek default model", i.model, "deepseek-flash")

i = resolved("local", "")
check("local works with no key", i.provider, "local")
check("local gets a placeholder key for picky gateways", i.api_key, "ollama")

# A real but unrecognisable key under "auto" must NOT be silently guessed.
cfg.set_runtime_config("auto", "sk-ambiguous123", "", "")
check("ambiguous sk- key under auto does not guess a provider", cfg.resolve_provider(), None)
cfg.clear_runtime_config()

# Missing key must not resolve to a half-configured provider.
cfg.set_runtime_config("openai", "", "", "")
check("provider without required key resolves to None", cfg.resolve_provider(), None)
cfg.clear_runtime_config()

# ------------------------------------------------------------ headers
section("HTTP request construction (intercepted, no network)")


def capture(provider, key, model="", base=""):
    """Run a fake call and return (url, headers, body)."""
    captured = {}
    original = llm._post_json

    def fake_post(url, headers, body):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = body
        # Shape-appropriate canned response for each API style.
        if "messages" in url:
            return {"content": [{"type": "text", "text": "ok"}]}
        return {"choices": [{"message": {"content": "ok"}}]}

    cfg.set_runtime_config(provider, key, model, base)
    llm._post_json = fake_post
    try:
        text = llm.call_llm("sys", "usr", 0.3, 512)
    finally:
        llm._post_json = original
        cfg.clear_runtime_config()
    captured["text"] = text
    return captured


c = capture("anthropic", "sk-ant-real123")
check("anthropic posts to /v1/messages", c["url"], "https://api.anthropic.com/v1/messages")
check("anthropic sends x-api-key", c["headers"].get("x-api-key"), "sk-ant-real123")
check("anthropic sends version header", c["headers"].get("anthropic-version"), "2023-06-01")
check("anthropic does NOT use Bearer auth", "Authorization" in c["headers"], False)
check("anthropic body uses top-level system", c["body"].get("system"), "sys")
check("anthropic parses text blocks", c["text"], "ok")

c = capture("openai", "sk-proj-real123")
check("openai posts to /v1/chat/completions", c["url"], "https://api.openai.com/v1/chat/completions")
check("openai sends Bearer auth", c["headers"].get("Authorization"), "Bearer sk-proj-real123")
check("openai does NOT send x-api-key", "x-api-key" in c["headers"], False)
check("openai body uses system message", c["body"]["messages"][0]["role"], "system")
check("openai parses content", c["text"], "ok")

c = capture("deepseek", "sk-real123")
check("deepseek posts to root endpoint", c["url"], "https://api.deepseek.com/chat/completions")
check("deepseek sends Bearer auth", c["headers"].get("Authorization"), "Bearer sk-real123")

# Reasoning models inside the real call path.
c = capture("openai", "sk-proj-real123", "o3-mini")
check("o3-mini call omits temperature", "temperature" in c["body"], False)
check("o3-mini call uses max_completion_tokens", "max_completion_tokens" in c["body"], True)

c = capture("deepseek", "sk-real123", "deepseek-v4-pro")
check("deepseek-v4-pro omits temperature", "temperature" in c["body"], False)
check("deepseek-v4-pro uses max_tokens", "max_tokens" in c["body"], True)

# --------------------------------------------------------------- summary
print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All checks passed.")
