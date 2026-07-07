from .json_utils import parse_json_from_llm
from .llm import call_llm
from .prompts.assets import build_asset_prompt
from .prompts.attack_paths import build_attack_path_prompt
from .prompts.item_definition import build_item_definition_prompts
from .prompts.risk_treatment import build_risk_treatment_prompt
from .prompts.structure_docx import build_structure_docx_prompts
from .prompts.threats import build_threat_prompt


def bad_request(error: str, message: str):
    return {"success": False, "statusCode": 400, "error": error, "message": message}


def extract_item_definition(payload):
    extracted_text = (payload.get("extractedText") or "").strip()
    filename = payload.get("filename") or ""
    if len(extracted_text) < 20:
        return bad_request("Insufficient text.", "The extracted text is too short to identify Item Definitions.")

    system_prompt, user_prompt = build_item_definition_prompts(extracted_text, filename)
    result_text = call_llm(system_prompt, user_prompt, 0.2, 4096)
    result = parse_json_from_llm(result_text)
    items = result.get("items")
    if not isinstance(items, list):
        raise ValueError("Response missing items array")

    normalized_items = []
    for index, item in enumerate(items):
        functions = item.get("functions") or []
        normalized_items.append(
            {
                "itemId": item.get("itemId") or f"ITEM-{index + 1:03d}",
                "itemName": item.get("itemName") or f"相关项 {index + 1}",
                "description": item.get("description") or "",
                "functions": [
                    {
                        "functionId": fn.get("functionId") or f"FNC-{fn_index + 1:03d}",
                        "functionName": fn.get("functionName") or f"功能 {fn_index + 1}",
                        "description": fn.get("description") or "",
                    }
                    for fn_index, fn in enumerate(functions)
                ],
            }
        )

    item_list_text = "\n\n".join(
        f"[{item['itemId']}] {item['itemName']}\n{item['description']}\n"
        + "\n".join(f"  - {fn['functionId']}: {fn['functionName']}" for fn in item["functions"])
        for item in normalized_items
    )
    system_description = result.get("systemDescription") or f"""
该系统包含以下相关项：

{item_list_text}

以上相关项构成了整个系统的功能架构，各相关项之间通过CAN总线、TSP平台等进行通信与数据交互。"""

    return {
        "success": True,
        "items": normalized_items,
        "itemCount": len(normalized_items),
        "totalFunctions": sum(len(item["functions"]) for item in normalized_items),
        "systemDescription": system_description,
        "itemDefinition": system_description,
        "originalLength": len(extracted_text),
        "extractedLength": len(result_text.strip()),
    }


def generate_assets(payload):
    project_name = payload.get("projectName") or ""
    system_description = (payload.get("systemDescription") or "").strip()
    optional_info = payload.get("optionalInfo") or ""
    if not system_description:
        return bad_request("System Description is required.", "Please provide a system description to analyze.")
    if len(system_description) < 20:
        return bad_request("System Description is too short.", "Please provide at least 20 characters for meaningful analysis.")

    prompt = build_asset_prompt(project_name, system_description, optional_info)
    result_text = call_llm(
        "你是一名汽车网络安全专家，专门从事TARA分析中的资产识别工作。你严格按照ISO/SAE 21434标准进行分析，输出必须是合法的JSON格式。",
        prompt,
    )
    result = parse_json_from_llm(result_text)
    assets = result.get("assets")
    if not isinstance(assets, list):
        raise ValueError("Response missing assets array")

    result["assets"] = [
        {
            "assetName": asset.get("assetName") or f"Asset {index + 1}",
            "assetType": asset.get("assetType") or "Unknown",
            "description": asset.get("description") or "",
            "valueRationale": asset.get("valueRationale") or "",
            "securityProperties": {
                "confidentiality": bool((asset.get("securityProperties") or {}).get("confidentiality", False)),
                "integrity": bool((asset.get("securityProperties") or {}).get("integrity", False)),
                "availability": bool((asset.get("securityProperties") or {}).get("availability", False)),
                "authenticity": bool((asset.get("securityProperties") or {}).get("authenticity", False)),
            },
            "damageScenarios": [
                {
                    "scenarioName": scenario.get("scenarioName") or f"损害场景 {scenario_index + 1}",
                    "description": scenario.get("description") or "",
                    "severity": scenario.get("severity") or "Medium",
                    "affectedProperty": scenario.get("affectedProperty") or "Unknown",
                }
                for scenario_index, scenario in enumerate(asset.get("damageScenarios") or [])
            ],
        }
        for index, asset in enumerate(assets)
    ]
    return result


def analyze_threats(payload):
    assets = payload.get("assets") or []
    if not isinstance(assets, list) or not assets:
        return bad_request("Assets required.", "Please complete Asset Identification (Step 2) first.")

    prompt = build_threat_prompt(payload.get("projectName") or "", payload.get("systemDescription") or "", assets)
    result_text = call_llm(
        "你是一名汽车网络安全威胁分析专家，严格遵循ISO/SAE 21434标准进行TARA威胁分析。输出必须是合法的JSON格式。",
        prompt,
        0.3,
        8192,
    )
    result = parse_json_from_llm(result_text)
    threats = result.get("threats")
    if not isinstance(threats, list):
        raise ValueError("Response missing threats array")

    result["threats"] = [
        {
            "threatId": threat.get("threatId") or f"T-{index + 1:03d}",
            "threatName": threat.get("threatName") or f"威胁 {index + 1}",
            "targetAsset": threat.get("targetAsset") or "",
            "strideCategory": threat.get("strideCategory") or "Unknown",
            "description": threat.get("description") or "",
            "damageScenario": threat.get("damageScenario") or "",
            "affectedSecurityProperty": threat.get("affectedSecurityProperty") or "",
            "threatSeverity": threat.get("threatSeverity") or "Medium",
        }
        for index, threat in enumerate(threats)
    ]
    return result


def generate_attack_paths(payload):
    threats = payload.get("threats") or []
    if not isinstance(threats, list) or not threats:
        return bad_request("Threats required.", "Please complete Threat Analysis (Step 3) first.")

    prompt = build_attack_path_prompt(payload.get("projectName") or "", payload.get("systemDescription") or "", threats)
    result_text = call_llm(
        "你是一名汽车网络安全攻击路径分析专家。你严格遵循ISO/SAE 21434标准，输出必须是合法的JSON格式。",
        prompt,
        0.3,
        8192,
    )
    result = parse_json_from_llm(result_text)
    attack_paths = result.get("attackPaths")
    if not isinstance(attack_paths, list):
        raise ValueError("Response missing attackPaths array")

    result["attackPaths"] = [
        {
            "attackPathId": path.get("attackPathId") or f"AP-{index + 1:03d}",
            "attackPathName": path.get("attackPathName") or f"攻击路径 {index + 1}",
            "relatedThreats": path.get("relatedThreats") or [],
            "entryPoint": path.get("entryPoint") or "",
            "attackSteps": path.get("attackSteps") or [],
            "requiredCapability": path.get("requiredCapability") or "",
            "attackFeasibility": path.get("attackFeasibility") or "Medium",
            "impactLevel": path.get("impactLevel") or "Medium",
        }
        for index, path in enumerate(attack_paths)
    ]
    return result


def generate_risk_treatment(payload):
    attack_paths = payload.get("attackPaths") or []
    if not isinstance(attack_paths, list) or not attack_paths:
        return bad_request("Attack paths required.", "Please complete Attack Path Analysis (Step 4) first.")

    prompt = build_risk_treatment_prompt(
        payload.get("projectName") or "",
        payload.get("systemDescription") or "",
        payload.get("threats") or [],
        attack_paths,
    )
    result_text = call_llm(
        "你是一名汽车网络安全风险处置专家。你严格遵循ISO/SAE 21434标准，输出必须是合法的JSON格式。",
        prompt,
        0.3,
        8192,
    )
    result = parse_json_from_llm(result_text)
    treatments = result.get("riskTreatments")
    if not isinstance(treatments, list):
        raise ValueError("Response missing riskTreatments array")

    result["riskTreatments"] = [
        {
            "treatmentId": treatment.get("treatmentId") or f"RT-{index + 1:03d}",
            "relatedAttackPath": treatment.get("relatedAttackPath") or "",
            "treatmentDecision": treatment.get("treatmentDecision") or "Mitigate",
            "controlName": treatment.get("controlName") or f"控制措施 {index + 1}",
            "controlDescription": treatment.get("controlDescription") or "",
            "controlType": treatment.get("controlType") or "Technical",
            "implementationPriority": treatment.get("implementationPriority") or "Medium",
            "residualRisk": treatment.get("residualRisk") or "Low",
            "verificationMethod": treatment.get("verificationMethod") or "",
        }
        for index, treatment in enumerate(treatments)
    ]
    return result


def structure_docx(payload):
    extracted_text = (payload.get("extractedText") or "").strip()
    if len(extracted_text) < 20:
        return bad_request("Insufficient content.", "The document content is too short to structure.")

    system_prompt, user_prompt = build_structure_docx_prompts(
        extracted_text,
        payload.get("extractedHtml") or "",
        payload.get("filename") or "",
    )
    result_text = call_llm(system_prompt, user_prompt, 0.1, 8192)
    structured_json = parse_json_from_llm(result_text)
    return {
        "success": True,
        "metadata": {
            "filename": payload.get("filename") or "unknown",
            "sourceType": "docx-html" if payload.get("extractedHtml") else "text",
            "originalLength": len(extracted_text),
        },
        "structuredJson": structured_json,
    }
