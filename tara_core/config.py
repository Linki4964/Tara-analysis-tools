import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


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


def get_runtime_config() -> dict:
    """Return a copy of the current runtime config (key masked)."""
    if not _runtime_config:
        return {}
    cfg = dict(_runtime_config)
    key = cfg.get("api_key", "")
    cfg["api_key"] = _mask_key(key)
    return cfg


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "*" * (len(key) - 8) + key[-4:]


# ---- Saved named configs CRUD ----

def list_saved_configs() -> list[dict]:
    """Return all saved configs with masked keys, plus the current one if active."""
    _init_configs_store()
    result: list[dict] = []
    for name, cfg in _saved_configs.items():
        result.append({
            "name": name,
            "provider": cfg.get("provider", "auto"),
            "model": cfg.get("model", ""),
            "base_url": cfg.get("base_url", ""),
            "api_key": _mask_key(cfg.get("api_key", "")),
            "active": _is_active(cfg),
        })
    return result


def save_current_config(name: str) -> dict | None:
    """Save the current runtime config under a given name. Returns the saved entry."""
    if not _runtime_config:
        return None
    _init_configs_store()
    _saved_configs[name] = dict(_runtime_config)
    _persist_saved_configs()
    return {
        "name": name,
        "provider": _runtime_config["provider"],
        "model": _runtime_config.get("model", ""),
        "base_url": _runtime_config.get("base_url", ""),
        "api_key": _mask_key(_runtime_config["api_key"]),
    }


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
    return {
        "name": name,
        "provider": cfg["provider"],
        "model": cfg.get("model", ""),
        "base_url": cfg.get("base_url", ""),
        "api_key": _mask_key(cfg["api_key"]),
    }


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
    """Guess the provider from the API key prefix."""
    if not api_key:
        return "none"
    if api_key.startswith("sk-ant-"):
        return "anthropic"
    if api_key.startswith("sk-"):
        return "deepseek"  # OpenAI-compatible (DeepSeek, OpenAI, etc.)
    return "deepseek"  # assume OpenAI-compatible for unknown formats


def resolve_provider() -> Optional[ProviderInfo]:
    # 1) Runtime config takes priority
    if _runtime_config:
        provider = _runtime_config["provider"]
        api_key = _runtime_config["api_key"]
        model = _runtime_config["model"]
        base_url = _runtime_config["base_url"]

        # "auto" — detect from key prefix
        if provider == "auto":
            provider = _detect_provider_from_key(api_key)

        if provider == "none":
            return None

        if provider == "local":
            return ProviderInfo(
                provider="local",
                model=model or "llama3",
                base_url=base_url or "http://localhost:11434/v1",
                api_key=api_key or "ollama",
            )

        if provider == "deepseek":
            return ProviderInfo(
                provider="deepseek",
                model=model or "deepseek-chat",
                base_url=base_url or "https://api.deepseek.com",
                api_key=api_key,
            )

        if provider == "anthropic":
            return ProviderInfo(
                provider="anthropic",
                model=model or "claude-sonnet-4-20250514",
                base_url="https://api.anthropic.com",
                api_key=api_key,
            )

    # 2) Fall back to .env
    load_env_file()
    provider = os.getenv("API_PROVIDER", "auto")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    deepseek_key = os.getenv("DEEPSEEK_API_KEY", "")

    if provider == "anthropic":
        selected = "anthropic"
    elif provider == "deepseek":
        selected = "deepseek"
    elif anthropic_key.startswith("sk-ant-"):
        selected = "anthropic"
    elif deepseek_key:
        selected = "deepseek"
    elif anthropic_key:
        selected = "anthropic"
    else:
        return None

    if selected == "deepseek":
        return ProviderInfo(
            provider="deepseek",
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            api_key=deepseek_key,
        )

    return ProviderInfo(
        provider="anthropic",
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
        base_url="https://api.anthropic.com",
        api_key=anthropic_key,
    )
