import json


def parse_json_from_llm(text_content: str):
    cleaned = (text_content or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return json.loads(cleaned.strip())


def compact_error_response(error: Exception, raw_response: str = "", label: str = "Failed to parse AI response."):
    payload = {
        "success": False,
        "statusCode": 500,
        "error": label,
        "message": str(error) or "The AI returned an invalid response. Please try again.",
    }
    if raw_response:
        payload["rawResponse"] = raw_response[:500]
    return payload
