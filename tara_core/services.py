import re
from uuid import uuid4

from .json_utils import parse_json_from_llm
from .llm import call_llm
from .prompts.assets import build_asset_prompt
from .prompts.attack_paths import build_attack_path_prompt
from .prompts.diagram import (
    CAPS,
    KIND_TO_CATEGORY,
    VALID_CATEGORIES,
    VALID_SERVICE_KINDS,
    build_diagram_prompt,
    build_diagram_system_prompt,
)
from .prompts.item_definition import build_item_definition_prompts
from .prompts.risk_treatment import build_risk_treatment_prompt
from .prompts.structure_docx import build_structure_docx_prompts
from .prompts.threats import build_threat_prompt
from .risk_scoring import enrich_treatment, score_attack_path, score_damage_scenario


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
        max_tokens=16384,
    )
    result = parse_json_from_llm(result_text)
    assets = result.get("assets")
    if not isinstance(assets, list):
        raise ValueError("Response missing assets array")

    result["assets"] = [
        {
            "assetId": asset.get("assetId") or f"AS-{index + 1:03d}",
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
                score_damage_scenario(
                    {
                        "scenarioId": scenario.get("scenarioId") or f"CsDS_AS_UNK_{scenario_index + 1:03d}",
                        "scenarioName": scenario.get("scenarioName") or f"损害场景 {scenario_index + 1}",
                        "description": scenario.get("description") or "",
                        "severity": scenario.get("severity") or "Medium",
                        "affectedProperty": scenario.get("affectedProperty") or "Unknown",
                        "safety": scenario.get("safety"),
                        "safetyRationale": scenario.get("safetyRationale", ""),
                        "financial": scenario.get("financial"),
                        "financialRationale": scenario.get("financialRationale", ""),
                        "operational": scenario.get("operational"),
                        "operationalRationale": scenario.get("operationalRationale", ""),
                        "privacy": scenario.get("privacy"),
                        "privacyRationale": scenario.get("privacyRationale", ""),
                    }
                )
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
        16384,
    )
    result = parse_json_from_llm(result_text)
    threats = result.get("threats")
    if not isinstance(threats, list):
        raise ValueError("Response missing threats array")

    result["threats"] = [
        {
            "threatId": threat.get("threatId") or f"CsTS_UNK_{index + 1:03d}",
            "threatName": threat.get("threatName") or f"威胁 {index + 1}",
            "targetAsset": threat.get("targetAsset") or "",
            "targetAssetName": threat.get("targetAssetName") or "",
            "strideCategory": threat.get("strideCategory") or "Unknown",
            "description": threat.get("description") or "",
            "relatedDamageScenarioId": threat.get("relatedDamageScenarioId") or "",
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
        16384,
    )
    result = parse_json_from_llm(result_text)
    attack_paths = result.get("attackPaths")
    if not isinstance(attack_paths, list):
        raise ValueError("Response missing attackPaths array")

    path_by_threat = {}
    for threat in threats:
        tid = threat.get("threatId", "")
        if tid:
            path_by_threat[tid] = threat

    normalized_paths = [
        score_attack_path(
            {
                "attackPathId": path.get("attackPathId") or f"AP-{index + 1:03d}",
                "attackPathName": path.get("attackPathName") or f"攻击路径 {index + 1}",
                "relatedThreats": path.get("relatedThreats") or [],
                "relatedDamageScenarioId": path.get("relatedDamageScenarioId") or "",
                "entryPoint": path.get("entryPoint") or "",
                "attackSteps": path.get("attackSteps") or [],
                "consequence": path.get("consequence") or "",
                "requiredCapability": path.get("requiredCapability") or "",
                # 5-dimension feasibility scoring
                "et": path.get("et"),
                "etRationale": path.get("etRationale", ""),
                "exp": path.get("exp"),
                "expRationale": path.get("expRationale", ""),
                "kn": path.get("kn"),
                "knRationale": path.get("knRationale", ""),
                "wo": path.get("wo"),
                "woRationale": path.get("woRationale", ""),
                "eq": path.get("eq"),
                "eqRationale": path.get("eqRationale", ""),
                # Legacy single-score fallback (still accepted)
                "attackFeasibility": path.get("attackFeasibility"),
                "attackFeasibilityScore": path.get("attackFeasibilityScore"),
                "attackFeasibilityLevel": path.get("attackFeasibilityLevel"),
                # Impact level
                "impactLevel": path.get("impactLevel") or "Medium",
            },
            _related_threats(path.get("relatedThreats") or [], threats),
        )
        for index, path in enumerate(attack_paths)
    ]
    result["attackPaths"] = normalized_paths
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
        16384,
    )
    result = parse_json_from_llm(result_text)
    treatments = result.get("riskTreatments")
    if not isinstance(treatments, list):
        raise ValueError("Response missing riskTreatments array")

    path_by_id = {path.get("attackPathId"): path for path in attack_paths}
    result["riskTreatments"] = [
        enrich_treatment(
            {
                "treatmentId": treatment.get("treatmentId") or f"RT-{index + 1:03d}",
                "relatedAttackPath": treatment.get("relatedAttackPath") or "",
                "relatedThreatId": treatment.get("relatedThreatId") or "",
                "relatedDamageScenarioId": treatment.get("relatedDamageScenarioId") or "",
                "treatmentDecision": treatment.get("treatmentDecision") or "Mitigate",
                "treatmentDecisionLabel": treatment.get("treatmentDecisionLabel") or "",
                "controlName": treatment.get("controlName") or f"控制措施 {index + 1}",
                "controlDescription": treatment.get("controlDescription") or "",
                "controlType": treatment.get("controlType") or "Technical",
                "implementationPriority": treatment.get("implementationPriority") or "Medium",
                "residualRisk": treatment.get("residualRisk") or "Low",
                "verificationMethod": treatment.get("verificationMethod") or "",
                # Cybersecurity Goal / Claim / Requirement
                "cybersecurityGoalId": treatment.get("cybersecurityGoalId") or "",
                "cybersecurityGoal": treatment.get("cybersecurityGoal") or "",
                "cybersecurityRequirement": treatment.get("cybersecurityRequirement") or "",
                "cybersecurityClaimId": treatment.get("cybersecurityClaimId") or "",
                "cybersecurityClaim": treatment.get("cybersecurityClaim") or "",
            },
            path_by_id.get(treatment.get("relatedAttackPath") or ""),
        )
        for index, treatment in enumerate(treatments)
    ]
    return result


def _related_threats(related_ids, threats):
    if not related_ids:
        return threats
    wanted = {str(item) for item in related_ids}
    matched = [threat for threat in threats if str(threat.get("threatId")) in wanted]
    return matched or threats


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


_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _clean(value, limit=200):
    if value is None:
        return ""
    text = str(value).strip()
    return text[:limit]


def _gen_ai_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


def _arr(raw: dict, key: str) -> list:
    value = raw.get(key)
    return value if isinstance(value, list) else []


def normalize_arch_model(raw, *, base=None, project_name: str = ""):
    """Normalize an AI-produced ArchModel into a canonical, fully-referenced model.

    Returns ``(model, warnings)``. Never fails on a single dangling element:
    invalid ids, unknown kinds and out-of-capacity elements are pruned individually
    and recorded as warnings instead of failing the whole diagram.
    """
    if not isinstance(raw, dict):
        raise ValueError("AI 返回格式异常：期望一个 JSON 对象。")
    warnings: list[str] = []

    raw_item = raw.get("item") if isinstance(raw.get("item"), dict) else {}
    item = {
        "id": _clean(raw_item.get("id")) or "item-001",
        "name": _clean(raw_item.get("name")) or _clean(project_name) or "未命名相关项",
        "description": _clean(raw_item.get("description")),
    }

    used: set[str] = {item["id"]}

    # ---- Pass 1: components ----
    comp_rename: dict[str, str] = {}
    comps: list[dict] = []
    for c in _arr(raw, "components"):
        if not isinstance(c, dict):
            continue
        name = _clean(c.get("name")) or f"部件 {len(comps) + 1}"
        raw_id = _clean(c.get("id"))
        nid = raw_id
        if not nid or not _ID_RE.fullmatch(nid) or nid in used:
            if nid:
                warnings.append(f"部件「{name}」id 非法或重复，已分配新 id")
            nid = _gen_ai_id("c")
        if raw_id:
            comp_rename[raw_id] = nid
        used.add(nid)
        is_ext = bool(c.get("isExternal"))
        kind = _clean(c.get("kind"))
        if kind not in KIND_TO_CATEGORY:
            kind = ""
        category = _clean(c.get("category"))
        if is_ext:
            category = "external"
        elif category not in VALID_CATEGORIES:
            category = KIND_TO_CATEGORY.get(kind, "hardware")
        comps.append(
            {
                "id": nid,
                "name": name,
                "kind": kind,
                "category": category,
                "isExternal": is_ext,
                "boundaryId": _clean(c.get("boundaryId")) or None,
                "description": _clean(c.get("description")),
            }
        )
    if len(comps) > CAPS["components"]:
        warnings.append(f"部件数超过上限 {CAPS['components']}，超出部分已丢弃")
        comps = comps[: CAPS["components"]]

    # ---- Pass 1: boundaries ----
    bd_rename: dict[str, str] = {}
    boundaries: list[dict] = []
    for b in _arr(raw, "boundaries"):
        if not isinstance(b, dict):
            continue
        name = _clean(b.get("name")) or f"安全域 {len(boundaries) + 1}"
        raw_id = _clean(b.get("id"))
        nid = raw_id
        if not nid or not _ID_RE.fullmatch(nid) or nid in used:
            if nid:
                warnings.append(f"边界「{name}」id 非法或重复，已分配新 id")
            nid = _gen_ai_id("b")
        if raw_id:
            bd_rename[raw_id] = nid
        used.add(nid)
        kind = _clean(b.get("kind")) or "security_domain"
        if kind not in ("security_domain", "trust_boundary"):
            kind = "security_domain"
        boundaries.append(
            {"id": nid, "name": name, "kind": kind, "description": _clean(b.get("description"))}
        )
    if len(boundaries) > CAPS["boundaries"]:
        warnings.append(f"安全域数量超过上限 {CAPS['boundaries']}，超出部分已丢弃")
        boundaries = boundaries[: CAPS["boundaries"]]

    # ---- Pass 1→2: resolve boundary membership on components ----
    valid_bd = {b["id"] for b in boundaries}
    for c in comps:
        raw_owner = c["boundaryId"] or ""
        if not raw_owner or c["isExternal"]:
            if c["isExternal"] and raw_owner:
                warnings.append(f"外部实体「{c['name']}」不能归属安全域，已移出")
            c["boundaryId"] = None
            continue
        resolved = bd_rename.get(raw_owner, raw_owner)
        if resolved in valid_bd:
            c["boundaryId"] = resolved
        else:
            warnings.append(f"部件「{c['name']}」归属的安全域不存在，已改为直属 Item")
            c["boundaryId"] = None

    # ---- Pass 2: services ----
    comp_by_id = {c["id"]: c for c in comps}
    svc_rename: dict[str, str] = {}
    services: list[dict] = []
    host_count: dict[str, int] = {}
    for s in _arr(raw, "services"):
        if not isinstance(s, dict):
            continue
        name = _clean(s.get("name")) or f"服务 {len(services) + 1}"
        raw_owner = _clean(s.get("componentId"))
        owner = comp_rename.get(raw_owner, raw_owner) if raw_owner else ""
        if not owner or owner not in comp_by_id:
            warnings.append(f"服务「{name}」的宿主部件不存在，已丢弃")
            continue
        if host_count.get(owner, 0) >= CAPS["services_per_component"]:
            warnings.append(
                f"部件「{comp_by_id[owner]['name']}」服务数量超过上限 "
                f"{CAPS['services_per_component']}，多余服务已丢弃"
            )
            continue
        raw_id = _clean(s.get("id"))
        nid = raw_id
        if not nid or not _ID_RE.fullmatch(nid) or nid in used:
            if nid:
                warnings.append(f"服务「{name}」id 非法或重复，已分配新 id")
            nid = _gen_ai_id("s")
        if raw_id:
            svc_rename[raw_id] = nid
        used.add(nid)
        kind = _clean(s.get("kind"))
        if kind not in VALID_SERVICE_KINDS:
            kind = ""
        host_count[owner] = host_count.get(owner, 0) + 1
        services.append(
            {
                "id": nid,
                "name": name,
                "componentId": owner,
                "kind": kind,
                "description": _clean(s.get("description")),
            }
        )
    if len(services) > CAPS["services"]:
        warnings.append(f"服务总数超过上限 {CAPS['services']}，超出部分已丢弃")
        services = services[: CAPS["services"]]

    # ---- Pass 2: flows ----
    comp_ids = {c["id"] for c in comps}
    svc_by_id = {s["id"]: s for s in services}

    def _resolve_ep(ep):
        if not isinstance(ep, dict):
            return None
        kind = _clean(ep.get("kind"))
        eid = _clean(ep.get("id"))
        if kind == "service":
            sid = svc_rename.get(eid, eid)
            if sid in svc_by_id:
                return ("service", sid)
        elif kind == "component":
            cid = comp_rename.get(eid, eid)
            if cid in comp_ids:
                return ("component", cid)
        return None

    def _ep_host(ep):
        kind, eid = ep
        return eid if kind == "component" else svc_by_id[eid]["componentId"]

    flows: list[dict] = []
    for f in _arr(raw, "flows"):
        if not isinstance(f, dict):
            continue
        label = _clean(f.get("label"), 80)
        src = _resolve_ep(f.get("source"))
        dst = _resolve_ep(f.get("target"))
        if not src or not dst:
            warnings.append(f"数据流「{label or '?'}」端点了不存在的部件/服务，已丢弃")
            continue
        if _ep_host(src) == _ep_host(dst):
            warnings.append(f"数据流「{label or '?'}」位于同一部件内部，无跨边界意义，已丢弃")
            continue
        raw_id = _clean(f.get("id"))
        nid = raw_id
        if not nid or not _ID_RE.fullmatch(nid) or nid in used:
            if nid:
                warnings.append(f"数据流「{label or '?'}」id 非法或重复，已分配新 id")
            nid = _gen_ai_id("f")
        used.add(nid)
        arrow = "double" if _clean(f.get("arrow")) == "double" else "single"
        flows.append(
            {
                "id": nid,
                "label": label,
                "source": {"kind": src[0], "id": src[1]},
                "target": {"kind": dst[0], "id": dst[1]},
                "arrow": arrow,
                "reason": _clean(f.get("reason")),
            }
        )
    if len(flows) > CAPS["flows"]:
        warnings.append(f"数据流数量超过上限 {CAPS['flows']}，超出部分已丢弃")
        flows = flows[: CAPS["flows"]]

    model = {
        "schemaVersion": 1,
        "item": item,
        "components": comps,
        "services": services,
        "boundaries": boundaries,
        "flows": flows,
    }
    return model, warnings


def _counts(model: dict) -> dict:
    n_comp = len(model.get("components") or [])
    n_svc = len(model.get("services") or [])
    n_bd = len(model.get("boundaries") or [])
    n_flow = len(model.get("flows") or [])
    return {
        "components": n_comp,
        "services": n_svc,
        "boundaries": n_bd,
        "flows": n_flow,
        "totalElements": n_comp + n_svc + n_bd + n_flow,
    }


def _diff_model(base, current: dict) -> dict:
    """Compute structural changes between a previous canonical model and the new one."""
    if not isinstance(base, dict):
        return {}

    def _ids(m, key):
        return {str(e.get("id")) for e in (m.get(key) or []) if isinstance(e, dict)}

    def _names(m, key):
        return {
            str(e.get("id")): str(e.get("name") or "")
            for e in (m.get(key) or [])
            if isinstance(e, dict)
        }

    changes: dict = {}
    for key in ("components", "services", "boundaries", "flows"):
        cap = key[0].upper() + key[1:]
        base_ids = _ids(base, key)
        cur_ids = _ids(current, key)
        changes[f"added{cap}"] = sorted(cur_ids - base_ids)
        changes[f"removed{cap}"] = sorted(base_ids - cur_ids)
    modified = []
    for key in ("components", "services", "boundaries"):
        base_n = _names(base, key)
        cur_n = _names(current, key)
        for nid in base_n.keys() & cur_n.keys():
            if base_n[nid] != cur_n[nid]:
                modified.append({"id": nid, "before": base_n[nid], "after": cur_n[nid]})
    changes["modifiedNames"] = modified
    return changes


def generate_diagram(payload: dict) -> dict:
    description = (payload.get("description") or "").strip()
    project_name = payload.get("projectName") or ""
    current_model = payload.get("currentModel")
    if not isinstance(current_model, dict) or not current_model.get("components"):
        current_model = None

    if not description:
        return bad_request("Description is required.", "请描述你想要绘制的系统架构内容，AI 将据此自动绘图。")
    if len(description) < 5:
        return bad_request("Description is too short.", "请提供至少 5 个字的描述，便于 AI 理解系统组成。")

    prompt = build_diagram_prompt(project_name, description, current_model)
    result_text = call_llm(build_diagram_system_prompt(), prompt, 0.3, 8192)
    result = parse_json_from_llm(result_text)
    model, warnings = normalize_arch_model(result, base=current_model, project_name=project_name)
    if not model["components"] and not model["services"]:
        raise ValueError("AI 未返回任何有效部件或服务，请换一种描述重试。")

    changes = _diff_model(current_model, model) if current_model else {}
    return {
        "success": True,
        "plan": _clean(result.get("plan"), 600),
        "summary": _clean(result.get("summary"), 600),
        "model": model,
        "counts": _counts(model),
        "changes": changes,
        "warnings": warnings,
        "description": description,
    }
