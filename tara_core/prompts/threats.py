def build_threat_prompt(project_name: str = "", system_description: str = "", assets=None):
    assets = assets or []

    # Compact asset list with damage scenario IDs
    asset_lines = []
    for index, asset in enumerate(assets):
        asset_id = asset.get("assetId", f"AS-{index+1}")
        asset_name = asset.get("assetName", "")
        asset_type = asset.get("assetType", "")
        scenarios = asset.get("damageScenarios") or []
        scenario_refs = ", ".join(
            f"{s.get('scenarioId', '?')}[{s.get('affectedProperty', '?')}]"
            for s in scenarios
        )
        asset_lines.append(
            f"{index+1}. [{asset_id}] {asset_name} ({asset_type}) | "
            f"损害场景: {scenario_refs}"
        )
    asset_list = "\n".join(asset_lines)

    project = project_name or "未命名项目"
    return f"""你是一名汽车网络安全威胁分析专家。

请严格遵循ISO/SAE 21434，使用STRIDE模型对以下资产进行威胁分析。

## 项目
{project}

## 系统描述
{system_description or '(继承自前序步骤)'}

## 资产与损害场景
{asset_list}

## STRIDE威胁模型

| 类别 | 对抗的安全属性 |
|------|---------------|
| Spoofing (S) — 欺骗 | 真实性 Authenticity |
| Tampering (T) — 篡改 | 完整性 Integrity |
| Repudiation (R) — 否认 | 不可否认性 Non-repudiation |
| Information Disclosure (I) — 信息泄露 | 保密性 Confidentiality |
| Denial of Service (D) — 拒绝服务 | 可用性 Availability |
| Elevation of Privilege (E) — 权限提升 | 授权 Authorization |

### STRIDE与安全属性匹配
- 保密性 → 优先 I(信息泄露)，其次 E(权限提升)
- 完整性 → 优先 T(篡改)，其次 S(欺骗)
- 可用性 → 优先 D(拒绝服务)，其次 T(篡改)

> 每个威胁只描述一种STRIDE类型。同一损害场景可对应多个STRIDE威胁。

## 威胁ID: `CsTS_AS_<类型缩写>_<序号>`（如CsTS_AS_Da_001）

## 描述公式
> **[[STRIDE类别]] 攻击者[角色] + [STRIDE手段] + [目标资产] + [攻击效果]。→ 关联损害场景: CsDS_xxx**

## 威胁严重程度
继承损害场景的影响等级: Minor→Minor, Moderate→Moderate, Major→Major/High, Severe→Severe/Critical

## 输出格式（精简优先）

{{
  "projectName": "{project}",
  "threats": [
    {{
      "threatId": "CsTS_AS_Da_001",
      "threatName": "CAN总线嗅探窃取远程控制指令",
      "targetAsset": "AS_Da_001",
      "targetAssetName": "远程启动/关闭指令流",
      "strideCategory": "Information Disclosure",
      "description": "[[Information Disclosure]] 攻击者在车辆附近部署CAN嗅探设备，逆向CAN矩阵，监听解析TBOX与VCU间远程控制报文，获取指令规律。→ 关联损害场景: CsDS_AS_Da_001",
      "relatedDamageScenarioId": "CsDS_AS_Da_001",
      "affectedSecurityProperty": "Confidentiality",
      "threatSeverity": "Major"
    }}
  ]
}}

**规则：**
1. 每个损害场景至少1个威胁，每个威胁只一种STRIDE
2. 描述以[[STRIDE类别]]开头，从攻击者视角编写，结尾标注关联CsDS
3. threatId前缀与目标资产类型一致
4. threatSeverity继承损害场景影响等级
5. 输出合法JSON"""
