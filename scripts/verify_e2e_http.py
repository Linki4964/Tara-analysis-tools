"""End-to-end verification over real HTTP (no external network, no API keys).

Stands up a local HTTP server that impersonates each provider's real endpoint,
points the app's configuration at it, and drives ``call_llm`` for real. This
exercises everything the offline unit tests stub out: URL construction, header
serialisation, JSON encoding, response parsing, and error handling.

Run:  python scripts/verify_e2e_http.py
"""

import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tara_core import config as cfg  # noqa: E402
from tara_core import llm  # noqa: E402

requests_seen: list[dict] = []
failures: list[str] = []


def check(label, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {label}")
    if not ok:
        print(f"         got : {got!r}")
        print(f"         want: {want!r}")
        failures.append(label)


class Handler(BaseHTTPRequestHandler):
    """Records the request, then answers in the style of the target provider."""

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode("utf-8")
        body = json.loads(raw) if raw else {}
        requests_seen.append(
            {
                "path": self.path,
                "headers": {k.lower(): v for k, v in self.headers.items()},
                "body": body,
            }
        )

        # Anthropic-shaped endpoint.
        if self.path.endswith("/v1/messages"):
            payload = {"content": [{"type": "text", "text": "anthropic-ok"}]}
        # An OpenAI-style error response, to prove we surface it readably.
        elif body.get("model") == "trigger-error":
            payload = {"error": {"message": "model not found", "type": "invalid_request_error"}}
            data = json.dumps(payload).encode()
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        # OpenAI-shaped endpoint.
        else:
            payload = {"choices": [{"message": {"role": "assistant", "content": "openai-ok"}}]}

        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass  # keep the test output clean


server = HTTPServer(("127.0.0.1", 0), Handler)
port = server.server_address[1]
base = f"http://127.0.0.1:{port}"
threading.Thread(target=server.serve_forever, daemon=True).start()
print(f"Test provider listening on {base}\n")


def call(provider, key, model="", base_url=""):
    """Configure, call for real over HTTP, and return (text, last_request)."""
    requests_seen.clear()
    cfg.set_runtime_config(provider, key, model, base_url)
    try:
        text = llm.call_llm("sys", "usr", 0.3, 512)
    finally:
        cfg.clear_runtime_config()
    return text, (requests_seen[-1] if requests_seen else None)


# ---------------------------------------------------------------- OpenAI
print("=== OpenAI over real HTTP ===")
text, req = call("openai", "sk-proj-real123", "gpt-4o", base)
check("response parsed", text, "openai-ok")
check("path includes /v1", req["path"], "/v1/chat/completions")
check("Bearer auth sent", req["headers"].get("authorization"), "Bearer sk-proj-real123")
check("temperature sent for gpt-4o", "temperature" in req["body"], True)
check("max_tokens sent for gpt-4o", "max_tokens" in req["body"], True)
check("system message present", req["body"]["messages"][0], {"role": "system", "content": "sys"})
check("user message present", req["body"]["messages"][1], {"role": "user", "content": "usr"})

# Base URL given WITHOUT /v1 must still hit /v1/chat/completions.
# This is the regression that previously produced a 404 against real OpenAI.
print("\n=== OpenAI base URL missing /v1 (regression: was a 404) ===")
check("test base really lacks /v1", "/v1" in base, False)
text, req = call("openai", "sk-proj-real123", "gpt-4o", base)
check("auto-corrected to /v1 path", req["path"], "/v1/chat/completions")
check("call still succeeded", text, "openai-ok")

# Reasoning model parameter adaptation.
print("\n=== OpenAI reasoning model (o3-mini) ===")
text, req = call("openai", "sk-proj-real123", "o3-mini", base)
check("temperature omitted", "temperature" in req["body"], False)
check("max_completion_tokens used", "max_completion_tokens" in req["body"], True)
check("legacy max_tokens absent", "max_tokens" in req["body"], False)

# -------------------------------------------------------------- DeepSeek
print("\n=== DeepSeek over real HTTP ===")
text, req = call("deepseek", "sk-real123", "deepseek-flash", base)
check("response parsed", text, "openai-ok")
check("endpoint at root (no /v1), per DeepSeek docs", req["path"], "/chat/completions")
check("Bearer auth sent", req["headers"].get("authorization"), "Bearer sk-real123")
check("max_tokens used (not max_completion_tokens)", "max_completion_tokens" in req["body"], False)
check("temperature omitted for thinking mode", "temperature" in req["body"], False)

# ------------------------------------------------------------- Anthropic
print("\n=== Anthropic over real HTTP (custom base URL honoured) ===")
text, req = call("anthropic", "sk-ant-real123", "claude-sonnet-4-6", base)
check("response parsed", text, "anthropic-ok")
check("path is /v1/messages", req["path"], "/v1/messages")
check("x-api-key sent", req["headers"].get("x-api-key"), "sk-ant-real123")
check("anthropic-version sent", req["headers"].get("anthropic-version"), "2023-06-01")
check("no Bearer authorization", "authorization" in req["headers"], False)
check("top-level system field", req["body"].get("system"), "sys")
check("temperature sent for Claude", "temperature" in req["body"], True)
check("max_tokens sent", req["body"].get("max_tokens"), 512)

# --------------------------------------------------------- error paths
print("\n=== Error handling ===")
try:
    call("openai", "sk-proj-real123", "trigger-error", base)
    check("upstream error raised", False, True)
except llm.LLMError as error:
    check("upstream error raised", True, True)
    check("provider message surfaced", "model not found" in str(error), True)

cfg.set_runtime_config("openai", "", "", "")
try:
    llm.call_llm("s", "u")
    check("missing key raises", False, True)
except llm.LLMError as error:
    check("missing key raises", True, True)
    check("error names all three providers", "OPENAI_API_KEY" in str(error), True)
finally:
    cfg.clear_runtime_config()

server.shutdown()

print("\n" + "=" * 60)
if failures:
    print(f"{len(failures)} FAILURE(S):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("All end-to-end HTTP checks passed.")
