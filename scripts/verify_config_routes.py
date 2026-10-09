"""Exercise the config routes without FastAPI/pydantic installed.

Stubs the minimal framework surface, then drives the real route functions so we
can prove the masked-key round-trip does not destroy a stored key.
"""

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# ---- minimal framework stubs -------------------------------------------
class _BaseModel:
    """Just enough pydantic to build request objects from keyword args."""

    def __init__(self, **kwargs):
        for field, default in self.__class__.__annotations__.items():
            if field in kwargs:
                setattr(self, field, kwargs[field])
            else:
                setattr(self, field, getattr(self.__class__, field, None))

    def model_dump(self):
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


stubs = {
    "pydantic": {"BaseModel": _BaseModel, "Field": lambda *a, **k: None},
    "fastapi": {"APIRouter": None, "UploadFile": object, "File": lambda *a, **k: None},
    "fastapi.responses": {"JSONResponse": lambda **k: k, "Response": object},
    "backend.services.file_extraction": {"extract_upload": None},
    "backend.core.database": {"is_database_configured": lambda: False},
    "backend.services.run_store": {
        name: (lambda *a, **k: None)
        for name in (
            "complete_run",
            "create_run",
            "delete_project",
            "delete_run",
            "get_run",
            "list_runs",
            "rename_project",
            "save_step_result",
            "update_run_metadata",
        )
    },
    "tara_core.services": {
        name: (lambda *a, **k: {"success": True})
        for name in (
            "extract_item_definition",
            "generate_assets",
            "analyze_threats",
            "generate_attack_paths",
            "generate_risk_treatment",
            "generate_diagram",
        )
    },
    "tara_core.export_excel": {"export_to_excel": None},
}
for name, attrs in stubs.items():
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules[name] = module


def _route_decorator(*args, **kwargs):
    def wrap(func):
        return func

    return wrap


class _Router:
    get = post = delete = patch = staticmethod(_route_decorator)


sys.modules["fastapi"].APIRouter = lambda *a, **k: _Router()

import backend.api.routes as routes  # noqa: E402
from tara_core.config import get_current_api_key  # noqa: E402
from tara_core.providers import mask_key  # noqa: E402


class Req:
    def __init__(self, **kw):
        self.__dict__.update(kw)


failures = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        print(f"         got : {got!r}")
        print(f"         want: {want!r}")
        failures.append(label)


print("=== POST /config then GET /config ===")
routes.set_config(Req(provider="openai", api_key="sk-proj-SECRETVALUE123", model=None, base_url=None))
displayed = routes.get_config()["config"]
check("key is masked in the response", displayed["api_key"], mask_key("sk-proj-SECRETVALUE123"))
check("masked value hides the middle of the key", "SECRETVALUE" not in displayed["api_key"], True)
check("provider echoed", displayed["provider"], "openai")

print("\n=== UI round-trip: POST the masked key back ===")
routes.set_config(Req(provider="openai", api_key=displayed["api_key"], model="gpt-4o-mini", base_url=None))
check("real key survived the round-trip", get_current_api_key(), "sk-proj-SECRETVALUE123")
check("model change was still applied", routes.resolve_provider().model, "gpt-4o-mini")

print("\n=== Replacing the key with a new real value still works ===")
routes.set_config(Req(provider="openai", api_key="sk-proj-NEWKEY456", model=None, base_url=None))
check("new key stored", get_current_api_key(), "sk-proj-NEWKEY456")

print("\n=== Provider catalog endpoint ===")
names = [p["name"] for p in routes.get_providers()["providers"]]
check("all four providers listed", names, ["anthropic", "openai", "deepseek", "local"])

print("\n=== Saved configs carry the placeholder flag ===")
routes.set_config(Req(provider="deepseek", api_key="your-deepseek-api-key", model=None, base_url=None))
entry = routes.create_config({"name": "template-key"})
check("placeholder detected on save", entry["entry"]["apiKeyIsPlaceholder"], True)
routes.delete_config_entry("template-key")

print("\n=== Clearing config falls back to .env ===")
routes.delete_config()
check("runtime key cleared", get_current_api_key(), "")

print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All route checks passed.")
