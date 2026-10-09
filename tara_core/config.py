import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .providers import (
    detect_provider_from_key,
    get_spec,
    is_placeholder_key,
    mask_key,
    normalize_base_url,
)


# ---- Runtime overrides (set via API by the frontend) ----
_runtime_config: dict = {}

# ---- Saved named configs (persisted to a JSON file) ----
_saved_configs_file = Path(__file__).resolve().parents[1] / ".tara_configs.json"
_saved_configs: dict[str, dict] = {}


def _load_saved_configs() -> None:
    """Load saved named configs from the JSON file."""
    _saved_configs.clear()
    if _saved_configs_file.exists():
        try:
            data = json.loads(_saved_configs_file.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                _saved_configs.update(data)
        except (json.JSONDecodeError, OSError):
            pass


def _persist_saved_configs() -> None:
    """Write saved configs back to the JSON file."""
    _saved_configs_file.parent.mkdir(parents=True, exist_ok=True)
    _saved_configs_file.write_text(
        json.dumps(_saved_configs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _init_configs_store() -> None:
    """Lazy-init: load on first access."""
    if not hasattr(_init_configs_store, "_done"):
        _load_saved_configs()
        _init_configs_store._done = True


@dataclass(frozen=True)
class ProviderInfo:
    provider: str
    model: str
    base_url: str
    api_key: str
    # "anthropic" or "openai" - tells the caller which wire protocol to speak.
    api_style: str = "openai"


def set_runtime_config(provider: str, api_key: str, model: str = "", base_url: str = "") -> None:
    """Store API config at runtime so users can bring their own key / local model."""
    _runtime_config.clear()
    _runtime_config["provider"] = provider
    _runtime_config["api_key"] = api_key
    _runtime_config["model"] = model
    _runtime_config["base_url"] = base_url


def clear_runtime_config() -> None:
    """Remove runtime config and fall back to .env."""
    _runtime_config.clear()


def get_current_api_key() -> str:
    """Return the unmasked runtime API key (server-side use only).

    Never expose this to clients; ``get_runtime_config`` masks it for display.
    """
    return _runtime_config.get("api_key", "")


def get_runtime_config() -> dict:
    """Return a copy of the current runtime config (key masked)."""
    if not _runtime_config:
        return {}
    cfg = dict(_runtime_config)
    key = cfg.get("api_key", "")
    cfg["api_key"] = mask_key(key)
    # Surface whether the stored key looks like an unfilled template so the UI
    # can warn instead of failing later with a confusing 401.
    cfg["apiKeyIsPlaceholder"] = is_placeholder_key(key)
    return cfg


def _mask_key(key: str) -> str:
    """Backwards-compatible alias for the shared masking helper."""
    return mask_key(key)


# ---- Saved named configs CRUD ----

def _serialize_saved(name: str, cfg: dict) -> dict:
    """Shared shape for a saved-config entry returned to the frontend."""
    return {
        "name": name,
        "provider": cfg.get("provider", "auto"),
        "model": cfg.get("model", ""),
        "base_url": cfg.get("base_url", ""),
        "api_key": mask_key(cfg.get("api_key", "")),
        "apiKeyIsPlaceholder": is_placeholder_key(cfg.get("api_key", "")),
        "active": _is_active(cfg),
    }


def list_saved_configs() -> list[dict]:
    """Return all saved configs with masked keys, plus the current one if active."""
    _init_configs_store()
    return [_serialize_saved(name, cfg) for name, cfg in _saved_configs.items()]


def save_current_config(name: str) -> dict | None:
    """Save the current runtime config under a given name. Returns the saved entry."""
    if not _runtime_config:
        return None
    _init_configs_store()
    _saved_configs[name] = dict(_runtime_config)
    _persist_saved_configs()
    return _serialize_saved(name, _runtime_config)


def delete_saved_config(name: str) -> bool:
    """Delete a saved config by name. Returns True if it existed."""
    _init_configs_store()
    if name not in _saved_configs:
        return False
    del _saved_configs[name]
    _persist_saved_configs()
    return True


def activate_saved_config(name: str) -> dict | None:
    """Switch the runtime config to a previously saved one."""
    _init_configs_store()
    cfg = _saved_configs.get(name)
    if not cfg:
        return None
    _runtime_config.clear()
    _runtime_config.update(cfg)
    return _serialize_saved(name, cfg)


def _is_active(cfg: dict) -> bool:
    """Check whether a saved config matches the current runtime config."""
    if not _runtime_config:
        return False
    return (
        cfg.get("provider") == _runtime_config.get("provider")
        and cfg.get("api_key") == _runtime_config.get("api_key")
        and cfg.get("model") == _runtime_config.get("model")
        and cfg.get("base_url") == _runtime_config.get("base_url")
    )


def load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _detect_provider_from_key(api_key: str) -> str:
    """Guess the provider from the API key prefix.

    Returns "none" when the key is absent, a template placeholder, or a format
    we genuinely cannot attribute to one provider.
    """
    if not api_key or is_placeholder_key(api_key):
        return "none"
    return detect_provider_from_key(api_key) or "none"


def _build_info(provider: str, api_key: str, model: str, base_url: str) -> ProviderInfo:
    """Assemble a resolved ProviderInfo, filling in provider defaults."""
    spec = get_spec(provider)
    return ProviderInfo(
        provider=spec.name,
        model=(model or "").strip() or spec.default_model,
        base_url=normalize_base_url(base_url, spec.name),
        # Local servers usually need no key, but some gateways expect any
        # non-empty string; "ollama" is the conventional placeholder.
        api_key=api_key or ("" if spec.requires_key else "ollama"),
        api_style=spec.api_style,
    )


def build_provider_info(provider: str, api_key: str, model: str = "", base_url: str = "") -> ProviderInfo:
    """Resolve an explicit, unsaved configuration for connection testing."""
    selected = (provider or "").strip().lower()
    if selected not in ("anthropic", "openai", "deepseek", "local"):
        raise ValueError("Please select a model provider before testing.")
    spec = get_spec(selected)
    if spec.requires_key and not api_key:
        raise ValueError("API Key is required for this provider.")
    return _build_info(selected, api_key, model, base_url)


def resolve_provider() -> Optional[ProviderInfo]:
    """Resolve the effective provider from runtime config, then .env."""
    # 1) Runtime config takes priority
    if _runtime_config:
        provider = (_runtime_config.get("provider") or "auto").strip().lower()
        api_key = _runtime_config.get("api_key", "")
        model = _runtime_config.get("model", "")
        base_url = _runtime_config.get("base_url", "")

        # "auto" - detect from the key prefix, then fall back to whichever
        # provider the user configured in .env.
        if provider == "auto":
            provider = _detect_provider_from_key(api_key)
            if provider == "none":
                env_provider = os.getenv("API_PROVIDER", "").strip().lower()
                if env_provider in ("anthropic", "openai", "deepseek", "local"):
                    provider = env_provider
                elif api_key:
                    # We hold a real but unrecognisable key. Rather than guess
                    # wrong and send the user's key to the wrong vendor, report
                    # nothing configured and let them pick a provider.
                    return None
                else:
                    provider = "local"

        if provider == "none":
            return None

        spec = get_spec(provider)
        if spec.requires_key and not api_key:
            return None
        return _build_info(provider, api_key, model, base_url)

    # 2) Fall back to .env
    load_env_file()

    def env_key(*names: str) -> str:
        for name in names:
            value = (os.getenv(name) or "").strip()
            if value and not is_placeholder_key(value):
                return value
        return ""

    anthropic_key = env_key("ANTHROPIC_API_KEY")
    openai_key = env_key("OPENAI_API_KEY")
    deepseek_key = env_key("DEEPSEEK_API_KEY")

    provider = (os.getenv("API_PROVIDER") or "auto").strip().lower()

    if provider not in ("anthropic", "openai", "deepseek", "local"):
        # Auto-detect. Template keys were already filtered out above, so a
        # present key means the user really configured that provider.
        if anthropic_key:
            provider = "anthropic"
        elif openai_key:
            provider = "openai"
        elif deepseek_key:
            provider = "deepseek"
        else:
            return None

    if provider == "anthropic":
        if not anthropic_key:
            return None
        return _build_info(
            "anthropic",
            anthropic_key,
            os.getenv("ANTHROPIC_MODEL", ""),
            os.getenv("ANTHROPIC_BASE_URL", ""),
        )

    if provider == "openai":
        if not openai_key:
            return None
        return _build_info(
            "openai",
            openai_key,
            os.getenv("OPENAI_MODEL", ""),
            os.getenv("OPENAI_BASE_URL", ""),
        )

    if provider == "deepseek":
        if not deepseek_key:
            return None
        return _build_info(
            "deepseek",
            deepseek_key,
            os.getenv("DEEPSEEK_MODEL", ""),
            os.getenv("DEEPSEEK_BASE_URL", ""),
        )

    # Local model: no key required.
    return _build_info(
        "local",
        "",
        os.getenv("LOCAL_MODEL", ""),
        os.getenv("LOCAL_BASE_URL", ""),
    )
