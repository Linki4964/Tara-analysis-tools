import json
import re


def parse_json_from_llm(text_content: str):
    """Parse JSON from LLM output, handling common formatting issues.

    The LLM sometimes produces JSON with minor syntax problems:
    - Single quotes instead of double quotes
    - Trailing commas
    - Unescaped control characters in string values
    - Extra text outside the JSON block
    """
    cleaned = (text_content or "").strip()

    # Strip markdown code fences
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    # Try strict parse first
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt repair: extract the JSON object/array with a regex
    # Find the outermost { } or [ ]
    extracted = _extract_json_block(cleaned)
    if extracted:
        try:
            return json.loads(extracted)
        except json.JSONDecodeError:
            pass

    # Last resort: try fixing common issues
    try:
        fixed = _fix_common_json_issues(extracted or cleaned)
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # If all repairs fail, raise a helpful error
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as e:
        hint = ""
        if "Unterminated string" in str(e):
            hint = (
                " — LLM 响应可能因 token 限制被截断。"
                "请尝试减少分析范围（如只分析部分资产/威胁），或使用支持更大输出的模型。"
            )
        raise ValueError(
            f"Failed to parse AI response as JSON: {e}.{hint} "
            f"Response snippet (first 300 chars): {cleaned[:300]}"
        )


def _extract_json_block(text: str) -> str | None:
    """Extract the outermost balanced JSON object or array from text.

    Handles cases where the LLM wraps the JSON in explanatory text.
    """
    # Try to find the first { or [ and match to the last } or ]
    for start_char, end_char in (("{", "}"), ("[", "]")):
        start = text.find(start_char)
        if start == -1:
            continue
        end = text.rfind(end_char)
        if end <= start:
            continue
        candidate = text[start : end + 1]
        # Quick sanity: check balanced braces
        if _is_balanced(candidate, start_char, end_char):
            return candidate
    return None


def _is_balanced(text: str, open_char: str, close_char: str) -> bool:
    depth = 0
    in_string = False
    escape = False
    for ch in text:
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == open_char:
            depth += 1
        elif ch == close_char:
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def _fix_common_json_issues(text: str) -> str:
    """Apply aggressive fixes for common LLM JSON formatting issues."""
    # Remove trailing commas before } or ]
    text = re.sub(r",\s*(\}|\])", r"\1", text)

    # Fix unquoted property names (most common LLM mistake in large JSON).
    # Matches: (leading comma/brace + optional whitespace) + (unquoted identifier) + (colon).
    def _quote_key(m: re.Match) -> str:
        prefix = m.group(1)
        key = m.group(2)
        colon = m.group(3)
        return f'{prefix}"{key}"{colon}'

    text = re.sub(
        r'(\{|\,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(:\s*)',
        _quote_key,
        text,
    )

    # Fix single-quoted property names: 'key': → "key":
    text = re.sub(r"(?<!\\)'([^']+)'(?=\s*:)", r'"\1"', text)

    # Fix single-quoted string values: : 'value' → : "value"
    text = re.sub(r":\s*'([^']*)'(?=\s*[,}\]])", r': "\1"', text)

    # Fix truncated response: if the text ends mid-string, try to close it intelligently.
    # The LLM may have hit max_tokens and the JSON is cut off inside a string value.
    # We attempt to close the last unclosed string and add closing brackets.
    text = _repair_truncation(text)

    return text


def _repair_truncation(text: str) -> str:
    """Attempt to repair a JSON response that was truncated mid-output.

    Common scenario: the LLM hits max_tokens and stops writing in the middle
    of a string value. We try to close the string and any open structures.
    """
    # Close unterminated string first
    in_string = False
    escaped = False
    for ch in text:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string

    if in_string:
        text = text.rstrip() + '..."'

    # Track open/close order (LIFO) to close structures correctly
    stack: list[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch == "}" or ch == "]":
            if stack and stack[-1] == ch:
                stack.pop()

    # Close from innermost to outermost (reverse stack order)
    suffix = "".join(reversed(stack))
    if suffix:
        text = text.rstrip() + suffix

    return text


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
