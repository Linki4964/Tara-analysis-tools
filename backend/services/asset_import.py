"""AI-assisted normalization of arbitrary user asset inventories."""

from __future__ import annotations

from typing import Any

from tara_core.json_utils import parse_json_from_llm
from tara_core.llm import call_llm


TYPE_MAP = {
    "数据流": "Da", "data flow": "Da", "da": "Da",
    "硬件": "Hw", "hardware": "Hw", "hw": "Hw",
    "软件": "Sw", "software": "Sw", "sw": "Sw",
    "外部实体": "Ee", "external entity": "Ee", "ee": "Ee",
    "数据": "Dt", "stored data": "Dt", "dt": "Dt",
}


def parse_assets_with_ai(text: str, filename: str) -> dict[str, Any]:
    system = "你是汽车网络安全资产数据治理专家。只输出合法 JSON，不要输出解释。"
    prompt = f'''用户上传了一份格式未知的资产清单。请识别行、列、表头和自然语言内容，将每项映射到统一资产分类。

统一分类只能是：Da（动态数据流）、Hw（物理硬件/ECU/总线）、Sw（软件/固件/协议栈）、Ee（系统边界外实体）、Dt（静态存储数据/密钥/日志）。
不要因为原文分类不同而丢弃资产；根据语义重新判断。无法确定时给出较低 confidence 并在 warnings 说明原因。
component_name 是所属组件；asset_name 是规范名称；standard_function_desc 是完整功能描述；common_interfaces 是字符串数组。

文件名：{filename}
原始内容：
{text[:50000]}

严格输出：
{{"assets":[{{"source_row":1,"source_name":"原始名称","component_name":"TBOX","asset_type":"Da","asset_name":"规范名称","standard_function_desc":"规范功能描述","common_interfaces":["CAN"],"confidence":0.92,"reason":"分类理由","selected":true}}],"warnings":["整体解析提示"]}}'''
    parsed = parse_json_from_llm(call_llm(system, prompt, temperature=0.0, max_tokens=12000))
    assets = parsed.get("assets", []) if isinstance(parsed, dict) else parsed
    normalized = []
    for index, raw in enumerate(assets if isinstance(assets, list) else []):
        if not isinstance(raw, dict):
            continue
        value = dict(raw)
        asset_type = str(value.get("asset_type", "")).strip().lower()
        value["asset_type"] = TYPE_MAP.get(asset_type, value.get("asset_type"))
        if value["asset_type"] not in {"Da", "Hw", "Sw", "Ee", "Dt"}:
            value["asset_type"] = "Sw"
            value["confidence"] = min(float(value.get("confidence", 0.5)), 0.5)
        value["source_row"] = value.get("source_row", index + 1)
        value["selected"] = value.get("selected", True)
        value["confidence"] = max(0.0, min(float(value.get("confidence", 0.5)), 1.0))
        if isinstance(value.get("common_interfaces"), str):
            value["common_interfaces"] = [x.strip() for x in value["common_interfaces"].split(",") if x.strip()]
        normalized.append(value)
    return {"assets": normalized, "warnings": parsed.get("warnings", []) if isinstance(parsed, dict) else [], "count": len(normalized)}
