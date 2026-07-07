import json
import sys
from json import JSONDecodeError
from pathlib import Path

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tara_core import services
from tara_core.json_utils import compact_error_response
from tara_core.llm import LLMError


COMMANDS = {
    "extract-item-definition": services.extract_item_definition,
    "generate-assets": services.generate_assets,
    "analyze-threats": services.analyze_threats,
    "generate-attack-paths": services.generate_attack_paths,
    "generate-risk-treatment": services.generate_risk_treatment,
    "structure-docx": services.structure_docx,
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(json.dumps({"success": False, "statusCode": 404, "error": "Unknown command."}, ensure_ascii=False))
        sys.exit(1)

    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except JSONDecodeError as error:
        print(json.dumps({"success": False, "statusCode": 400, "error": "Invalid JSON.", "message": str(error)}, ensure_ascii=False))
        sys.exit(1)

    try:
        result = COMMANDS[sys.argv[1]](payload)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result.get("success", True) else 1)
    except LLMError as error:
        print(
            json.dumps(
                {
                    "success": False,
                    "statusCode": error.status_code,
                    "error": "LLM call failed.",
                    "message": str(error),
                },
                ensure_ascii=False,
            )
        )
        sys.exit(1)
    except Exception as error:
        print(json.dumps(compact_error_response(error), ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
