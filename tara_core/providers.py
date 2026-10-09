"""Single source of truth for LLM provider behaviour.

Every provider-specific detail lives here so that ``config.py`` and ``llm.py``
never need to branch on a provider name:

* default model / base URL
* how the API key is transmitted (``x-api-key`` vs ``Authorization: Bearer``)
* how a user-supplied base URL is normalised into a request URL
* which generation parameters the target model actually accepts

The parameter-capability layer matters because the two OpenAI-compatible
providers want *opposite* things from the same fields:

* OpenAI o-series / GPT-5 reject a custom ``temperature`` outright (HTTP 400)
  and require ``max_completion_tokens`` instead of the deprecated ``max_tokens``.
* DeepSeek runs thinking mode by default, which silently ignores
  ``temperature`` and documents only ``max_tokens``.

Sending one parameter set to both would break whichever provider disagrees, so
we branch and send only what the target model actually supports.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


# Providers the UI can offer, in display order.
PROVIDER_ORDER = ("anthropic", "openai", "deepseek", "local")

# ``auto`` and ``none`` are routing states rather than real providers.
KNOWN_PROVIDERS = set(PROVIDER_ORDER)


@dataclass(frozen=True)
class ProviderSpec:
    """Static description of one provider."""

    name: str
    label: str
    default_model: str
    default_base_url: str
    requires_key: bool
    # Anthropic uses a private Messages API; everyone else is OpenAI-compatible.
    api_style: str  # "anthropic" | "openai"
    # Whether a user may point this provider at a custom endpoint (proxy, gateway).
    allows_custom_base_url: bool = True


PROVIDERS: dict[str, ProviderSpec] = {
    "anthropic": ProviderSpec(
        name="anthropic",
        label="Anthropic (Claude)",
        # Claude model IDs move quickly. claude-sonnet-4-6 is the current
        # broadly-available Sonnet; older IDs such as claude-sonnet-4-5 and
        # claude-sonnet-4-20250514 are superseded, so users on a specific
        # generation should override this in Settings.
        default_model="claude-sonnet-4-6",
        default_base_url="https://api.anthropic.com",
        requires_key=True,
        api_style="anthropic",
    ),
    "openai": ProviderSpec(
        name="openai",
        label="OpenAI",
        default_model="gpt-4o",
        # NOTE: the /v1 suffix is part of the base URL.  Pointing at
        # https://api.openai.com and appending /chat/completions yields a 404,
        # which is the single most common misconfiguration for this API.
        default_base_url="https://api.openai.com/v1",
        requires_key=True,
        api_style="openai",
    ),
    "deepseek": ProviderSpec(
        name="deepseek",
        label="DeepSeek",
        # deepseek-chat / deepseek-reasoner were retired on 2026-07-24.
        # Current IDs per https://api-docs.deepseek.com/quick_start/pricing
        default_model="deepseek-flash",
        # DeepSeek serves /chat/completions at the root; /v1 is legacy and no
        # longer documented, so the root form is the safe default.
        default_base_url="https://api.deepseek.com",
        requires_key=True,
        api_style="openai",
    ),
    "local": ProviderSpec(
        name="local",
        label="本地模型 (Ollama / LM Studio / vLLM)",
        default_model="llama3",
        default_base_url="http://localhost:11434/v1",
        requires_key=False,
        api_style="openai",
    ),
}

# Used when the provider is unknown, so callers still get a usable target.
_FALLBACK = PROVIDERS["deepseek"]


def get_spec(provider: str) -> ProviderSpec:
    """Return the spec for ``provider``, falling back to a safe default."""
    return PROVIDERS.get((provider or "").strip().lower(), _FALLBACK)


def describe_providers() -> list[dict]:
    """Serialise the catalog for the frontend settings page."""
    result = []
    for name in PROVIDER_ORDER:
        spec = PROVIDERS[name]
        result.append(
            {
                "name": spec.name,
                "label": spec.label,
                "defaultModel": spec.default_model,
                "defaultBaseUrl": spec.default_base_url,
                "requiresKey": spec.requires_key,
                "allowsCustomBaseUrl": spec.allows_custom_base_url,
                "apiStyle": spec.api_style,
            }
        )
    return result


# --------------------------------------------------------------------------
# Base URL normalisation
# --------------------------------------------------------------------------

# Endpoint suffixes a user might paste into the "Base URL" field by mistake.
# We strip them and re-derive the correct request URL.
_ENDPOINT_SUFFIXES = (
    "/chat/completions",
    "/v1/messages",
    "/messages",
    "/completions",
)


def normalize_base_url(base_url: str, provider: str) -> str:
    """Clean up a user-supplied base URL.

    Handles the mistakes people actually make:

    * trailing slash(es)                       -> stripped
    * pasting the full endpoint                -> reduced to the base
    * OpenAI-compatible host without ``/v1``   -> ``/v1`` appended

    Anthropic's base URL is version-less (the ``/v1`` is added when building
    the request path), so the ``/v1`` rule applies only to OpenAI-compatible
    providers.
    """
    spec = get_spec(provider)
    url = (base_url or "").strip().rstrip("/")
    if not url:
        return spec.default_base_url

    # Drop a pasted endpoint path so we never double it up.
    lowered = url.lower()
    for suffix in _ENDPOINT_SUFFIXES:
        if lowered.endswith(suffix):
            url = url[: -len(suffix)].rstrip("/")
            break

    # Local gateways (Ollama etc.) frequently serve without a version prefix,
    # and both /v1 and version-less URLs are valid for DeepSeek, so only
    # enforce /v1 where the API genuinely requires it.
    if spec.api_style == "openai" and provider == "openai" and not url.lower().endswith("/v1"):
        url = f"{url}/v1"

    return url or spec.default_base_url


def chat_completions_url(base_url: str, provider: str) -> str:
    """Build the OpenAI-compatible chat completions endpoint."""
    return f"{normalize_base_url(base_url, provider)}/chat/completions"


def messages_url(base_url: str, provider: str = "anthropic") -> str:
    """Build the Anthropic Messages endpoint."""
    base = normalize_base_url(base_url, provider)
    # The user may already have included /v1 in their custom endpoint.
    if base.lower().endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


# --------------------------------------------------------------------------
# Parameter capabilities
# --------------------------------------------------------------------------
#
# Verified provider behaviour (see module docstring references):
#
#   * OpenAI o-series / GPT-5: a custom ``temperature`` is a hard HTTP 400
#     ("Only the default (1) is supported"), and the legacy ``max_tokens`` is
#     rejected - these require ``max_completion_tokens``.
#   * DeepSeek thinking mode ignores ``temperature``/``presence_penalty``/
#     ``frequency_penalty`` without erroring, and documents only
#     ``max_tokens``. Thinking mode is ON by default, so we omit temperature.
#
# Because the two providers want opposite things, we branch rather than trying
# to find one parameter set that satisfies both.

# Models that reject a custom temperature outright.
_OPENAI_REASONING_MARKERS = (
    "o1",
    "o3",
    "o4",
    "gpt-5",
)

# Models that require max_completion_tokens instead of the legacy max_tokens.
_MAX_COMPLETION_TOKENS_MARKERS = (
    "o1",
    "o3",
    "o4",
    "gpt-5",
)

# DeepSeek models that run in thinking mode by default and therefore ignore
# temperature. The legacy names are included so an existing saved config keeps
# working rather than suddenly erroring.
_DEEPSEEK_THINKING_MARKERS = (
    "deepseek-flash",
    "deepseek-v4",
    "deepseek-reasoner",
    "deepseek-chat",
    "reasoner",
)

_QWEN_MODEL_MARKERS = (
    "qwen",
    "qwq",
)


def _matches(model: str, markers: tuple[str, ...]) -> bool:
    """Case-insensitive marker match anchored at a token boundary.

    The boundary check stops "o1" from matching inside an unrelated model name
    while still matching "o1-mini" and "vendor/o3-mini".
    """
    name = (model or "").strip().lower()
    if not name:
        return False
    # Drop any "vendor/" prefix a gateway may prepend.
    name = name.rsplit("/", 1)[-1]
    for marker in markers:
        if name.startswith(marker):
            return True
        if f"-{marker}" in name:
            return True
    return False


def supports_temperature(model: str, provider: str = "") -> bool:
    """Whether a custom ``temperature`` should be sent for this model.

    Omitting the field is the safe choice wherever it is unsupported, because
    OpenAI errors hard on it and DeepSeek silently discards it.
    """
    if _matches(model, _OPENAI_REASONING_MARKERS):
        return False
    # DeepSeek thinking mode is on by default and ignores temperature.
    if provider == "deepseek" and _matches(model, _DEEPSEEK_THINKING_MARKERS):
        return False
    return True


def max_tokens_field(model: str, provider: str = "") -> str:
    """Name of the output-length field the model expects."""
    if _matches(model, _MAX_COMPLETION_TOKENS_MARKERS):
        return "max_completion_tokens"
    # DeepSeek documents only max_tokens.
    return "max_tokens"


def is_qwen_model(model: str) -> bool:
    """Whether the configured model is a Qwen/QwQ model."""
    return _matches(model, _QWEN_MODEL_MARKERS)


def build_chat_payload(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    provider: str = "",
) -> dict:
    """Assemble an OpenAI-compatible request body for this model."""
    payload: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if supports_temperature(model, provider):
        payload["temperature"] = temperature
    payload[max_tokens_field(model, provider)] = max_tokens
    # Structured tasks need the final JSON, not a separate reasoning trace.
    # Qwen mixed-thinking models can otherwise exhaust the output budget in
    # reasoning_content and leave message.content empty.
    if is_qwen_model(model):
        payload["enable_thinking"] = False
    return payload


def build_messages_payload(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
    provider: str = "anthropic",
) -> dict:
    """Assemble an Anthropic Messages request body for this model."""
    payload: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    if supports_temperature(model, provider):
        payload["temperature"] = temperature
    # Alibaba Model Studio's Anthropic-compatible endpoint uses the Anthropic
    # thinking object instead of OpenAI's enable_thinking flag.
    if is_qwen_model(model):
        payload["thinking"] = {"type": "disabled"}
    return payload


# --------------------------------------------------------------------------
# Key inspection
# --------------------------------------------------------------------------

# Values copied straight out of .env.example.  Treating these as real keys
# produces a confusing 401 instead of a clear "not configured yet" message.
_PLACEHOLDER_KEYS = (
    "your-anthropic-api-key",
    "your-deepseek-api-key",
    "your-openai-api-key",
    "your-api-key",
    "sk-xxx",
    "xxx",
    "changeme",
    "none",
    "null",
)


def is_placeholder_key(api_key: str) -> bool:
    """Whether the key is an unfilled template value rather than a real key."""
    key = (api_key or "").strip().strip('"').strip("'")
    if not key:
        return False
    lowered = key.lower()
    if lowered in _PLACEHOLDER_KEYS:
        return True
    # "your-...-key" style templates.
    return lowered.startswith("your-") and ("key" in lowered or "token" in lowered)


def mask_key(key: str) -> str:
    """Mask a key for display, keeping a short prefix/suffix for recognition."""
    key = key or ""
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


def is_masked_key(key: str) -> bool:
    """Whether ``key`` looks like output of :func:`mask_key` rather than a real key.

    A masked key is ``<4 chars><8+ asterisks><4 chars>``.  Real provider keys
    contain no asterisks, so their presence is a reliable signal.
    """
    key = (key or "").strip()
    if len(key) < 8:
        return False
    if "*" not in key:
        return False
    return key[:4] == mask_key(key)[:4] and key[-4:] == mask_key(key)[-4:]


def detect_provider_from_key(api_key: str) -> Optional[str]:
    """Best-effort provider guess from a key's prefix.

    Only Anthropic is reliably identifiable (``sk-ant-``).  OpenAI and DeepSeek
    both issue ``sk-`` prefixed keys, so they are genuinely
    indistinguishable by prefix alone - ``sk-proj-`` hints strongly at OpenAI
    but is not a guarantee.  Returning ``None`` for the ambiguous case lets the
    caller fall back to an explicit user choice instead of silently guessing
    wrong.
    """
    key = (api_key or "").strip()
    if not key or is_placeholder_key(key):
        return None
    lowered = key.lower()
    if lowered.startswith("sk-ant-"):
        return "anthropic"
    # OpenAI project keys are the one OpenAI-specific prefix we can lean on.
    if lowered.startswith("sk-proj-"):
        return "openai"
    return None
