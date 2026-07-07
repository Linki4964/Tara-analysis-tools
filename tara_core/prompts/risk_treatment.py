def build_risk_treatment_prompt(project_name: str = "", system_description: str = "", threats=None, attack_paths=None):
    threats = threats or []
    attack_paths = attack_paths or []
    ap_list = "\n".join(
        f"{index + 1}. [{ap.get('attackPathId', '')}] {ap.get('attackPathName', '')} - 可行性: {ap.get('attackFeasibility', '')}, 影响: {ap.get('impactLevel', '')}"
        for index, ap in enumerate(attack_paths)
    )
    threat_list = "\n".join(
        f"{index + 1}. [{threat.get('threatId', '')}] {threat.get('threatName', '')} - 严重程度: {threat.get('threatSeverity', '')}"
        for index, threat in enumerate(threats)
    )
    project = project_name or "未命名项目"
    return f"""你是一名汽车网络安全风险处置专家。

请根据ISO/SAE 21434标准，针对以下攻击路径和威胁，制定风险处置方案。

## 项目名称
{project}

## 系统描述
{system_description or '(继承自前序步骤)'}

## 威胁列表
{threat_list or '(无)'}

## 攻击路径
{ap_list}

## 分析要求

对于每个攻击路径，确定处置决策并设计安全控制措施。

处置决策类型：
- Eliminate（消除）：移除风险源
- Mitigate（缓解）：降低风险到可接受水平
- Share（分担）：转移/分担风险
- Accept（接受）：接受残余风险

控制措施类型：
- Technical（技术控制）
- Organizational（组织控制）
- Physical（物理控制）

## 输出格式
严格输出以下JSON：

{{
  "projectName": "{project}",
  "riskTreatments": [
    {{
      "treatmentId": "RT-001",
      "relatedAttackPath": "AP-001",
      "treatmentDecision": "Mitigate",
      "controlName": "控制措施名称",
      "controlDescription": "详细描述",
      "controlType": "Technical",
      "implementationPriority": "High",
      "residualRisk": "Low",
      "verificationMethod": "验证方法描述"
    }}
  ]
}}"""
