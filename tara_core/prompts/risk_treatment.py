def build_risk_treatment_prompt(project_name: str = "", system_description: str = "", threats=None, attack_paths=None):
    threats = threats or []
    attack_paths = attack_paths or []

    # Compact attack path list
    ap_lines = []
    for index, ap in enumerate(attack_paths):
        ap_id = ap.get("attackPathId", "")
        ap_name = ap.get("attackPathName", "")
        sl = ap.get("securityRiskLevel", "-")
        treatment = ap.get("recommendedTreatmentDecision", "")
        ap_lines.append(f"{index + 1}. [{ap_id}] {ap_name} | SL:{sl} | 推荐:{treatment}")
    ap_list = "\n".join(ap_lines) if ap_lines else "(无)"

    # Compact threat list
    threat_lines = []
    for index, threat in enumerate(threats):
        threat_lines.append(
            f"{index + 1}. [{threat.get('threatId', '')}] {threat.get('threatName', '')} | "
            f"资产:{threat.get('targetAsset', '')} | STRIDE:{threat.get('strideCategory', '')} | "
            f"损害场景:{threat.get('relatedDamageScenarioId', '')}"
        )
    threat_list = "\n".join(threat_lines) if threat_lines else "(无)"

    project = project_name or "未命名项目"
    return f"""你是一名汽车网络安全风险处置专家。请根据ISO/SAE 21434，为以下攻击路径制定风险处置方案，包括网络安全目标(CsGO)、需求(Requirement)和声明(CsCL)。

## 项目
{project}

## 系统描述
{system_description or '(继承自前序步骤)'}

## 威胁
{threat_list}

## 攻击路径
{ap_list}

## 处置决策规则

| SL | 决策 | 说明 |
|----|------|------|
| 5 | Eliminate 消除 | 必须移除风险源，采取设计变更 |
| 4 | Mitigate 缓解 | 通过安全控制措施降低风险 |
| 3 | Share 转移 | 通过合同/保险/供应商转移 |
| 1-2 | Accept 保留 | 接受风险，**不设网络安全目标/声明** |

### Accept(保留)时的填写规则
处置为Accept时，以下字段填 `/`：cybersecurityGoalId, cybersecurityGoal, cybersecurityRequirement, cybersecurityClaimId, cybersecurityClaim

## 网络安全目标 (CsGO)

- ID格式: `CsGO_<相关项缩写>_<序号>`（相关项缩写如VIU），如 `CsGO_VIU_001`
- 编写公式: **[保护的安全属性/功能] + [保护措施/技术手段] + [防止的威胁]**
- **多个相关威胁可共用一个CsGO**（保护措施相同时合并）

## 网络安全需求 (Requirement)
- 编写公式: **[具体技术措施] + [覆盖范围] + [验证方式]**
- 描述具体的技术实现要求

## 网络安全声明 (CsCL)
- ID格式: `CsCL_<相关项缩写>_<序号>`，如 `CsCL_VIU_001`
- 编写公式: **[验证对象] + [满足的安全要求] + [验证方式/证据]**
- 声明必须是可测试/可验证的陈述句

## 输出格式（精简每条描述，避免冗长）

{{
  "projectName": "{project}",
  "riskTreatments": [
    {{
      "treatmentId": "RT-001",
      "relatedAttackPath": "AP_AS_Da_001",
      "relatedThreatId": "CsTS_AS_Da_001",
      "relatedDamageScenarioId": "CsDS_AS_Da_001",
      "treatmentDecision": "Mitigate",
      "treatmentDecisionLabel": "缓解",
      "securityRiskLevel": 4,
      "controlName": "远程控制指令加密传输",
      "controlDescription": "TBOX-TSP远程指令采用TLS 1.3加密+HMAC签名校验",
      "controlType": "Technical",
      "implementationPriority": "High",
      "residualRisk": "Low",
      "verificationMethod": "抓包验证加密状态，测试非法签名拒绝",
      "cybersecurityGoalId": "CsGO_VIU_001",
      "cybersecurityGoal": "远程控制信号需加密传输，防中间人攻击与篡改",
      "cybersecurityRequirement": "1.TLS 1.3加密传输 2.HMAC-SHA256签名校验 3.频率限制（10条/分钟）",
      "cybersecurityClaimId": "CsCL_VIU_001",
      "cybersecurityClaim": "经验证TBOX-TSP通信已启用TLS 1.3，抓包确认无明文传输"
    }},
    {{
      "treatmentId": "RT-002",
      "relatedAttackPath": "AP_AS_Da_002",
      "relatedThreatId": "CsTS_AS_Da_002",
      "relatedDamageScenarioId": "CsDS_AS_Da_003",
      "treatmentDecision": "Accept",
      "treatmentDecisionLabel": "保留",
      "securityRiskLevel": 1,
      "controlName": "保留风险",
      "controlDescription": "攻击需物理拆卸内饰接触CAN线路，可行性极低",
      "controlType": "Organizational",
      "implementationPriority": "Low",
      "residualRisk": "Low",
      "verificationMethod": "定期回顾风险登记册",
      "cybersecurityGoalId": "/",
      "cybersecurityGoal": "/",
      "cybersecurityRequirement": "/",
      "cybersecurityClaimId": "/",
      "cybersecurityClaim": "/"
    }}
  ]
}}

**关键规则：**
1. SL5→Eliminate, SL4→Mitigate, SL3→Share, SL1/2→Accept
2. Accept时CsGO/CsCL/Requirement全部填 `/`
3. 多个威胁可共用一个CsGO（保护措施相同时合并）
4. 每个字段精简，特别是描述和声明控制在30字以内
5. 输出合法JSON"""
