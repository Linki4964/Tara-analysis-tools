def build_asset_prompt(project_name: str = "", system_description: str = "", optional_info: str = ""):
    project = project_name or "未命名项目"
    prompt = f"""你是一名拥有丰富经验的汽车网络安全工程师。

请根据ISO/SAE 21434中Asset Identification的思想，分析以下系统描述，识别系统中所有值得保护的重要资产（Asset）。

## 项目名称
{project}

## 系统描述
{system_description}
"""
    if optional_info:
        prompt += f"""
## 补充信息
{optional_info}
"""

    prompt += f"""
## 分析要求

Asset可以包括但不限于以下类型：
- Data（数据）
- Software（软件）
- Firmware（固件）
- ECU
- Communication Link（通信链路）
- Key（密钥）
- Credentials（凭据）
- OTA Package（OTA升级包）
- Configuration（配置）
- User Privacy（用户隐私）
- Cloud Resource（云端资源）
- Service（服务）

对于每一个识别出的Asset，请输出以下字段：
- assetName: Asset的名称
- assetType: Asset的类型（从上述类型中选择）
- description: 对该Asset的描述
- valueRationale: 为什么该Asset值得保护（其在系统中的价值）
- securityProperties: 该Asset需要保护的安全属性对象，包含 confidentiality、integrity、availability、authenticity 四个布尔字段
- damageScenarios: 该资产如果被攻击可能导致的损害场景数组（至少2个）

## 输出格式
请严格按照以下JSON格式输出，不要包含任何其他文字、解释或markdown标记：

{{
  "projectName": "{project}",
  "assets": [
    {{
      "assetName": "资产名称",
      "assetType": "资产类型",
      "description": "资产描述",
      "valueRationale": "保护价值说明",
      "securityProperties": {{
        "confidentiality": true,
        "integrity": true,
        "availability": false,
        "authenticity": true
      }},
      "damageScenarios": [
        {{
          "scenarioName": "损害场景名称",
          "description": "损害场景的详细描述",
          "severity": "High",
          "affectedProperty": "Confidentiality"
        }}
      ]
    }}
  ]
}}

每个资产至少包含 2 个 damageScenarios。

请确保输出是合法的JSON，且assets数组不为空。"""
    return prompt
