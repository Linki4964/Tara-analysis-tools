from __future__ import annotations

from typing import Any

# ═══════════════════════════════════════════════════════════════
# Damage Scenario Impact Scoring (S/F/O/P → Total → Impact Level)
# ═══════════════════════════════════════════════════════════════

# Impact score ranges for each dimension per ISO/SAE 21434:
#   S (Safety):    0 (no injury), 10 (minor/moderate), 100 (severe/life-threatening)
#   F (Financial): 0 (negligible), 1-10 (acceptable), 100 (major), 1000 (catastrophic)
#   O (Operational): 0 (no impact), 1 (degradation), 3-10 (partial failure), 100 (inoperable)
#   P (Privacy):   0 (no impact), 10 (negligible), 100 (severe)

DAMAGE_IMPACT_DIMENSIONS = {
    "S": {"key": "Safety", "label": "安全性", "scores": [0, 10, 100]},
    "F": {"key": "Financial", "label": "财产", "scores": [0, 1, 10, 100, 1000]},
    "O": {"key": "Operational", "label": "操作", "scores": [0, 1, 10, 100]},
    "P": {"key": "Privacy", "label": "隐私", "scores": [0, 10, 100]},
}

# Thresholds: Total = S + F + O + P
# >1000 Severe, >100 Major, >20 Moderate, <=20 Minor
DAMAGE_IMPACT_LEVEL_THRESHOLDS = [
    (1000, "Severe", "严重", "造成严重影响，必须优先消除风险"),
    (100, "Major", "主要", "造成较大影响，需要重点关注和处理"),
    (20, "Moderate", "中等", "造成一定影响，但在可接受范围内"),
    (0, "Minor", "轻微", "影响几乎不存在或可忽略"),
]


def score_damage_impact(
    safety: int = 0,
    financial: int = 0,
    operational: int = 0,
    privacy: int = 0,
) -> dict[str, Any]:
    """Calculate the composite damage impact score and level from S/F/O/P dimensions.

    Args:
        safety: Safety impact score (0, 10, or 100).
        financial: Financial impact score (0–1000).
        operational: Operational impact score (0, 1, 10, or 100).
        privacy: Privacy impact score (0, 10, or 100).

    Returns:
        Dict with total, level key/label, and per-dimension breakdown with rationale hints.
    """
    total = safety + financial + operational + privacy

    level_key, level_label, level_desc = "Minor", "轻微", DAMAGE_IMPACT_LEVEL_THRESHOLDS[-1][3]
    for threshold, key, label, desc in DAMAGE_IMPACT_LEVEL_THRESHOLDS:
        if total > threshold:
            level_key, level_label, level_desc = key, label, desc
            break

    return {
        "total": total,
        "impactLevel": level_key,
        "impactLevelLabel": level_label,
        "impactLevelDescription": level_desc,
        "dimensions": {
            "safety": safety,
            "financial": financial,
            "operational": operational,
            "privacy": privacy,
        },
    }


def score_damage_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    """Score a damage scenario dict that may already carry S/F/O/P fields.

    Expects any of these keys (case-insensitive per first letter convention):
        - ``safety`` / ``safetyScore`` / ``S``
        - ``financial`` / ``financialScore`` / ``F``
        - ``operational`` / ``operationalScore`` / ``O``
        - ``privacy`` / ``privacyScore`` / ``P``

    Also looks for ``safetyRationale``, ``financialRationale``, etc.

    Returns the scenario dict enriched with ``damageImpact`` scoring.
    """
    s = _safe_int(_pick(scenario, "safety", "safetyScore", "S"), 0)
    f = _safe_int(_pick(scenario, "financial", "financialScore", "F"), 0)
    o = _safe_int(_pick(scenario, "operational", "operationalScore", "O"), 0)
    p = _safe_int(_pick(scenario, "privacy", "privacyScore", "P"), 0)

    impact = score_damage_impact(safety=s, financial=f, operational=o, privacy=p)

    enriched = dict(scenario)
    enriched["safetyScore"] = s
    enriched["safetyRationale"] = scenario.get("safetyRationale", "")
    enriched["financialScore"] = f
    enriched["financialRationale"] = scenario.get("financialRationale", "")
    enriched["operationalScore"] = o
    enriched["operationalRationale"] = scenario.get("operationalRationale", "")
    enriched["privacyScore"] = p
    enriched["privacyRationale"] = scenario.get("privacyRationale", "")
    enriched["damageImpactTotal"] = impact["total"]
    enriched["damageImpactLevel"] = impact["impactLevel"]
    enriched["damageImpactLevelLabel"] = impact["impactLevelLabel"]
    enriched["damageImpactLevelDescription"] = impact["impactLevelDescription"]
    return enriched


def _pick(mapping: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in mapping and mapping[k] is not None:
            return mapping[k]
    return None


# ═══════════════════════════════════════════════════════════════
# Attack Feasibility Scoring (ET/EXP/KN/WO/EQ → TOTAL → AL)
# ═══════════════════════════════════════════════════════════════

# Five-dimension attack feasibility per ISO/SAE 21434 Annex G
ATTACK_FEASIBILITY_DIMENSIONS = {
    "ET": {
        "key": "Elapsed Time",
        "label": "经过时间",
        "description": "攻击者识别并利用漏洞所需的总耗时",
        "scores": {
            0: "≤1 天",
            1: "≤1 周",
            2: "≤1 月",
            3: "≤3 月",
            4: "≤6 月",
            7: ">6 月",
        },
    },
    "EXP": {
        "key": "Expertise",
        "label": "专业经验",
        "description": "攻击者需要具备的技术技能水平",
        "scores": {
            0: "外行 Layman",
            1: "熟练者 Proficient",
            2: "专家 Expert",
            3: "多领域专家 Multiple Expert",
            4: "顶尖研究者 Elite Researcher",
        },
    },
    "KN": {
        "key": "Knowledge of Target",
        "label": "目标知识度",
        "description": "攻击者需要对目标系统的了解程度",
        "scores": {
            0: "公开信息 Public",
            1: "受限信息 Restricted",
            2: "敏感信息 Sensitive",
            3: "关键信息 Critical",
        },
    },
    "WO": {
        "key": "Window of Opportunity",
        "label": "机会窗口",
        "description": "实施攻击所需的时间窗口/访问机会",
        "scores": {
            0: "无限 Unlimited",
            1: "容易 Easy",
            2: "中等 Moderate",
            3: "困难 Difficult",
            4: "无 None",
        },
    },
    "EQ": {
        "key": "Equipment",
        "label": "设备",
        "description": "攻击所需的硬件/软件工具",
        "scores": {
            0: "无设备",
            1: "标准设备 Standard",
            2: "专业设备 Specialized",
            3: "定制设备 Bespoke",
            4: "多设备组合 Multiple Bespoke",
        },
    },
}

# Attack feasibility level (AL) thresholds
# TOTAL = ET + EXP + KN + WO + EQ
# Higher TOTAL = harder attack = lower feasibility level
ATTACK_FEASIBILITY_LEVEL_THRESHOLDS = [
    (25, 1, "Very Low", "非常低", "攻击几乎不可行，所需条件极其苛刻"),
    (20, 2, "Low", "低", "攻击可行性低，需要较强的综合能力"),
    (14, 3, "Medium", "中等", "攻击有一定可行性，专业技术团队可实现"),
    (0, 4, "High", "高", "攻击可行性高，个人或小团队即可实现"),
]

ATTACK_FEASIBILITY_LEVELS = {
    1: {"key": "Very Low", "label": "非常低", "scoreRange": "≥25"},
    2: {"key": "Low", "label": "低", "scoreRange": "20-24"},
    3: {"key": "Medium", "label": "中等", "scoreRange": "14-19"},
    4: {"key": "High", "label": "高", "scoreRange": "0-13"},
}


def calculate_feasibility_level(total_score: int) -> dict[str, Any]:
    """Calculate attack feasibility level (AL) from total 5-dimension score.

    Args:
        total_score: Sum of ET + EXP + KN + WO + EQ.

    Returns:
        Dict with level number, key, label, and description.
    """
    for threshold, level, key, label, desc in ATTACK_FEASIBILITY_LEVEL_THRESHOLDS:
        if total_score >= threshold:
            return {
                "level": level,
                "key": key,
                "label": label,
                "description": desc,
            }
    # Fallback (should not reach here with threshold 0)
    return {
        "level": 4,
        "key": "High",
        "label": "高",
        "description": "攻击可行性高",
    }


def score_attack_feasibility(
    et: int = 0,
    exp: int = 0,
    kn: int = 0,
    wo: int = 0,
    eq: int = 0,
    et_rationale: str = "",
    exp_rationale: str = "",
    kn_rationale: str = "",
    wo_rationale: str = "",
    eq_rationale: str = "",
) -> dict[str, Any]:
    """Calculate attack feasibility from five dimensions.

    Args:
        et: Elapsed Time score (0, 1, 2, 3, 4, 7)
        exp: Expertise score (0-4)
        kn: Knowledge of Target score (0-3)
        wo: Window of Opportunity score (0-4)
        eq: Equipment score (0-4)
        et_rationale: Rationale for ET score
        exp_rationale: Rationale for EXP score
        kn_rationale: Rationale for KN score
        wo_rationale: Rationale for WO score
        eq_rationale: Rationale for EQ score

    Returns:
        Dict with total, level, and per-dimension breakdown.
    """
    total = et + exp + kn + wo + eq
    feasibility = calculate_feasibility_level(total)

    return {
        "total": total,
        "level": feasibility["level"],
        "levelKey": feasibility["key"],
        "levelLabel": feasibility["label"],
        "levelDescription": feasibility["description"],
        "dimensions": {
            "ET": {"score": et, "label": "经过时间", "rationale": et_rationale or _et_label(et)},
            "EXP": {"score": exp, "label": "专业经验", "rationale": exp_rationale or _exp_label(exp)},
            "KN": {"score": kn, "label": "目标知识度", "rationale": kn_rationale or _kn_label(kn)},
            "WO": {"score": wo, "label": "机会窗口", "rationale": wo_rationale or _wo_label(wo)},
            "EQ": {"score": eq, "label": "设备", "rationale": eq_rationale or _eq_label(eq)},
        },
    }


def _et_label(score: int) -> str:
    return ATTACK_FEASIBILITY_DIMENSIONS["ET"]["scores"].get(score, f"分值 {score}")


def _exp_label(score: int) -> str:
    return ATTACK_FEASIBILITY_DIMENSIONS["EXP"]["scores"].get(score, f"分值 {score}")


def _kn_label(score: int) -> str:
    return ATTACK_FEASIBILITY_DIMENSIONS["KN"]["scores"].get(score, f"分值 {score}")


def _wo_label(score: int) -> str:
    return ATTACK_FEASIBILITY_DIMENSIONS["WO"]["scores"].get(score, f"分值 {score}")


def _eq_label(score: int) -> str:
    return ATTACK_FEASIBILITY_DIMENSIONS["EQ"]["scores"].get(score, f"分值 {score}")


# ═══════════════════════════════════════════════════════════════
# Impact Levels (IL) — for Attack Path context
# ═══════════════════════════════════════════════════════════════

IMPACT_LEVELS = {
    1: {"key": "Minor", "label": "轻微", "description": "发生造成的影响几乎不存在"},
    2: {"key": "Moderate", "label": "中等", "description": "风险低，导致资产受到影响的可能性较小"},
    3: {"key": "Major", "label": "主要", "description": "风险中，导致资产受到影响的可能性较大"},
    4: {"key": "Severe", "label": "严重", "description": "风险高，导致资产受到严重影响的可能性较大"},
}

# ═══════════════════════════════════════════════════════════════
# Security Risk Level Matrix (IL × AL → SL)
# ═══════════════════════════════════════════════════════════════

SECURITY_LEVEL_MATRIX = {
    # IL=1 Minor
    1: {1: 1, 2: 1, 3: 1, 4: 1},
    # IL=2 Moderate
    2: {1: 1, 2: 2, 3: 2, 4: 3},
    # IL=3 Major
    3: {1: 1, 2: 2, 3: 3, 4: 4},
    # IL=4 Severe
    4: {1: 2, 2: 3, 3: 4, 4: 5},
}

RISK_LEVELS = {
    1: {"key": "Very Low", "label": "非常低", "meaning": "发生造成的影响几乎不存在"},
    2: {"key": "Low", "label": "低", "meaning": "风险低，导致资产受到影响的可能性较小"},
    3: {"key": "Medium", "label": "中", "meaning": "风险中，导致资产受到影响的可能性较大"},
    4: {"key": "High", "label": "高", "meaning": "风险高，可能导致业务系统异常运行，造成经济损失"},
    5: {"key": "Severe", "label": "严重", "meaning": "风险严重，可能严重影响业务系统运行，造成重大损失"},
}

TREATMENT_BY_SECURITY_LEVEL = {
    5: {"decision": "Eliminate", "label": "消除", "description": "移除风险源，规避风险。必须采取设计变更从根本上消除风险来源。"},
    4: {"decision": "Mitigate", "label": "缓解", "description": "缓解风险，降低风险。通过安全控制措施将风险降低到可接受水平。"},
    3: {"decision": "Share", "label": "转移", "description": "共享或转移风险。通过合同协议、保险、供应商责任等方式转移风险。"},
    2: {"decision": "Accept", "label": "保留", "description": "接受或保留风险。风险处于可接受水平，无需额外控制措施。"},
    1: {"decision": "Accept", "label": "保留", "description": "接受或保留风险。风险极低，无需额外控制措施。"},
}


# ═══════════════════════════════════════════════════════════════
# Attack Path Scoring (Impact × Feasibility → Security Level)
# ═══════════════════════════════════════════════════════════════

def score_attack_path(path: dict[str, Any], related_threats: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Score an attack path by combining impact level and attack feasibility.

    Handles both the legacy single-score format and the new 5-dimension
    (ET/EXP/KN/WO/EQ) format for attack feasibility.

    Args:
        path: Attack path dict with impactLevel and feasibility scores.
        related_threats: Related threat dicts for fallback impact derivation.

    Returns:
        The attack path dict enriched with scoring fields.
    """
    # --- Impact Level (IL) ---
    impact_level = _impact_level(path.get("impactLevel") or _highest_threat_severity(related_threats or []))

    # --- Attack Feasibility Level (AL) ---
    # Try new 5-dimension scoring first
    if all(k in path for k in ("et", "exp", "kn", "wo", "eq")):
        feasibility = score_attack_feasibility(
            et=_safe_int(path.get("et"), 0),
            exp=_safe_int(path.get("exp"), 0),
            kn=_safe_int(path.get("kn"), 0),
            wo=_safe_int(path.get("wo"), 0),
            eq=_safe_int(path.get("eq"), 0),
            et_rationale=str(path.get("etRationale", "")),
            exp_rationale=str(path.get("expRationale", "")),
            kn_rationale=str(path.get("knRationale", "")),
            wo_rationale=str(path.get("woRationale", "")),
            eq_rationale=str(path.get("eqRationale", "")),
        )
        feasibility_level = feasibility["level"]
    else:
        # Fallback to legacy single-score
        feasibility_level = _attack_feasibility_level(path)
        feasibility = {
            "total": _safe_int(path.get("attackFeasibilityScore"), -1),
            "level": feasibility_level,
            "levelKey": ATTACK_FEASIBILITY_LEVELS[feasibility_level]["key"],
            "levelLabel": ATTACK_FEASIBILITY_LEVELS[feasibility_level]["label"],
            "levelDescription": "",
            "dimensions": {},
        }

    # --- Security Risk Level (SL) ---
    security_level = SECURITY_LEVEL_MATRIX[impact_level][feasibility_level]
    risk = RISK_LEVELS[security_level]
    treatment = TREATMENT_BY_SECURITY_LEVEL[security_level]

    scored = dict(path)
    scored["impactLevel"] = IMPACT_LEVELS[impact_level]["key"]
    scored["impactLevelScore"] = impact_level
    scored["impactLevelLabel"] = IMPACT_LEVELS[impact_level]["label"]
    scored["attackFeasibility"] = feasibility["levelKey"]
    scored["attackFeasibilityLevel"] = feasibility_level
    scored["attackFeasibilityLabel"] = feasibility["levelLabel"]

    # 5-dimension feasibility fields
    scored["attackFeasibilityTotal"] = feasibility["total"]
    scored["attackFeasibilityDimensions"] = feasibility["dimensions"]

    scored["securityRiskLevel"] = security_level
    scored["securityRiskLevelLabel"] = risk["label"]
    scored["securityRiskLevelName"] = risk["key"]
    scored["riskMeaning"] = risk["meaning"]
    scored["treatmentDecisionScore"] = security_level
    scored["treatmentDecisionLevel"] = security_level
    scored["recommendedTreatmentDecision"] = treatment["decision"]
    scored["recommendedTreatmentLabel"] = treatment["label"]
    scored["recommendedTreatmentDescription"] = treatment["description"]
    return scored


def enrich_treatment(treatment: dict[str, Any], attack_path: dict[str, Any] | None) -> dict[str, Any]:
    """Enrich a risk treatment record with scoring from its associated attack path.

    Also applies the Accept → fill "/" rule for cybersecurity goal/claim
    when the treatment decision is Accept/Retain.

    Args:
        treatment: Risk treatment dict.
        attack_path: Associated attack path dict (may be None).

    Returns:
        Enriched treatment dict.
    """
    enriched = dict(treatment)
    if not attack_path:
        return enriched

    security_level = _safe_int(attack_path.get("securityRiskLevel"), 3)
    decision = TREATMENT_BY_SECURITY_LEVEL[security_level]
    enriched["securityRiskLevel"] = security_level
    enriched["securityRiskLevelLabel"] = RISK_LEVELS[security_level]["label"]
    enriched["treatmentDecisionScore"] = security_level
    enriched["treatmentDecisionLevel"] = security_level
    enriched["treatmentDecision"] = decision["decision"]
    enriched["treatmentDecisionLabel"] = decision["label"]
    enriched["treatmentDecisionRationale"] = decision["description"]
    enriched.setdefault("implementationPriority", _priority_from_security_level(security_level))

    # Apply Accept/Retain → fill "/" rule for CsGO/CsCL/CsRequirement
    if decision["decision"] in ("Accept", "Retain"):
        if not enriched.get("cybersecurityGoalId") or enriched.get("cybersecurityGoalId", "").strip() == "Retain":
            enriched["cybersecurityGoalId"] = "/"
            enriched["cybersecurityGoal"] = "/"
            enriched["cybersecurityRequirement"] = "/"
            enriched["cybersecurityClaimId"] = "/"
            enriched["cybersecurityClaim"] = "/"

    return enriched


# ═══════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════

def _impact_level(value: Any) -> int:
    """Parse impact level from various formats to 1-4 int."""
    text = str(value or "").strip().lower()
    direct = _safe_int(value, 0)
    if 1 <= direct <= 4:
        return direct
    if any(token in text for token in ("severe", "critical", "catastrophic", "严重")):
        return 4
    if any(token in text for token in ("major", "high", "主要", "高")):
        return 3
    if any(token in text for token in ("moderate", "medium", "中等", "中")):
        return 2
    if any(token in text for token in ("minor", "low", "light", "轻微", "低")):
        return 1
    return 2


def _attack_feasibility_level(path: dict[str, Any]) -> int:
    """Legacy fallback: derive feasibility level from path dict."""
    raw_score = path.get("attackFeasibilityScore")
    if raw_score is not None:
        score = _safe_int(raw_score, -1)
        if score >= 25:
            return 1
        if 20 <= score <= 24:
            return 2
        if 14 <= score <= 19:
            return 3
        if 0 <= score <= 13:
            return 4

    text = str(path.get("attackFeasibility") or "").strip().lower()
    direct = _safe_int(path.get("attackFeasibilityLevel"), 0)
    if 1 <= direct <= 4:
        return direct
    if any(token in text for token in ("very low", "非常低")):
        return 1
    if any(token in text for token in ("low", "低")):
        return 2
    if any(token in text for token in ("medium", "moderate", "中等", "中")):
        return 3
    if any(token in text for token in ("high", "高")):
        return 4
    return 3


def _highest_threat_severity(threats: list[dict[str, Any]]) -> str:
    best_level = 0
    best_value = "Medium"
    for threat in threats:
        value = threat.get("threatSeverity") or threat.get("impactLevel") or "Medium"
        level = _impact_level(value)
        if level > best_level:
            best_level = level
            best_value = str(value)
    return best_value


def _safe_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _priority_from_security_level(security_level: int) -> str:
    if security_level >= 5:
        return "Critical"
    if security_level >= 4:
        return "High"
    if security_level == 3:
        return "Medium"
    return "Low"
