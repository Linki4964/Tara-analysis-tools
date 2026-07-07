import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class ProviderInfo:
    provider: str
    model: str
    base_url: str
    api_key: str


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


def resolve_provider() -> Optional[ProviderInfo]:
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
