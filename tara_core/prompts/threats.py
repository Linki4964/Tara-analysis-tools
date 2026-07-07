def build_threat_prompt(project_name: str = "", system_description: str = "", assets=None):
    assets = assets or []
    asset_list = "\n".join(
        f"{index + 1}. {asset.get('assetName', '')} ({asset.get('assetType', '')}) - {asset.get('description', '')}"
        for index, asset in enumerate(assets)
    )
    project = project_name or "未命名项目"
    return f"""你是一名拥有丰富经验的汽车网络安全工程师。

请根据ISO/SAE 21434标准，对以下系统进行威胁分析（Threat Analysis），识别出针对已识别资产的潜在威胁场景。

## 项目名称
{project}

## 系统描述
{system_description or '(从资产识别步骤继承)'}

## 已识别的资产
{asset_list}

## 分析要求

对每个资产，使用STRIDE模型识别潜在威胁：
- Spoofing（欺骗）
- Tampering（篡改）
- Repudiation（否认）
- Information Disclosure（信息泄露）
- Denial of Service（拒绝服务）
- Elevation of Privilege（权限提升）

## 输出格式
严格输出以下JSON，不要包含任何其他文字：

{{
  "projectName": "{project}",
  "threats": [
    {{
      "threatId": "T-001",
      "threatName": "威胁名称",
      "targetAsset": "目标资产",
      "strideCategory": "Spoofing",
      "description": "威胁描述",
      "damageScenario": "损害场景描述",
      "affectedSecurityProperty": "Confidentiality",
      "threatSeverity": "High"
    }}
  ]
}}

请输出合法JSON，threats数组不为空。"""
