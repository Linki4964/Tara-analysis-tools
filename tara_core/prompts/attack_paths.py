def build_attack_path_prompt(project_name: str = "", system_description: str = "", threats=None):
    threats = threats or []
    threat_count = len(threats)

    # Compact threat list — only key fields
    threat_lines = []
    for index, threat in enumerate(threats):
        threat_lines.append(
            f"{index + 1}. [{threat.get('threatId', '')}] {threat.get('threatName', '')} | "
            f"资产: {threat.get('targetAsset', '')} | STRIDE: {threat.get('strideCategory', '')} | "
            f"损害场景: {threat.get('relatedDamageScenarioId', '')} | 严重程度: {threat.get('threatSeverity', 'Medium')}"
        )
    threat_list = "\n".join(threat_lines)

    # Limit: if too many threats, ask to focus on most important ones
    max_paths_note = ""
    if threat_count > 10:
        max_paths_note = f"\n> ⚠️ 威胁数量较多（{threat_count}个），请重点生成最关键的10-15条攻击路径，优先覆盖影响等级高（Major/Severe）的威胁。每条描述和理由必须精简（20字以内）。\n"

    project = project_name or "未命名项目"
    return f"""你是一名汽车网络安全攻击路径分析专家。请根据ISO/SAE 21434，对以下威胁构建攻击路径，并评分。

## 项目
{project}

## 系统描述
{system_description or '(继承自前序步骤)'}

## 威胁列表
{threat_list}
{max_paths_note}
## 攻击路径 ID：AP_AS_<类型缩写>_<序号>（如AP_AS_Da_001）

## 描述公式
[入口]→[步骤1:获取信息]→[步骤2:进入系统]→[步骤3:横向移动]→[步骤4:实现威胁]→[后果]
每个步骤一句话，精炼描述具体技术手段。

## 攻击可行性评分（五维度）

| 维度 | 分值范围 | 含义简述 |
|------|---------|---------|
| ET(经过时间) | 0/1/2/3/4/7 | 0=≤1天, 1=≤1周, 2=≤1月, 3=≤3月, 4=≤6月, 7=>6月 |
| EXP(专业经验) | 0-4 | 0=外行, 1=熟练者, 2=专家, 3=多领域专家, 4=顶尖 |
| KN(目标知识度) | 0-3 | 0=公开, 1=受限, 2=敏感, 3=关键 |
| WO(机会窗口) | 0-4 | 0=无限, 1=容易, 2=中等, 3=困难, 4=无 |
| EQ(设备) | 0-4 | 0=无, 1=标准, 2=专业, 3=定制, 4=多设备组合 |

TOTAL = ET+EXP+KN+WO+EQ
- TOTAL≥25→AL=1(非常低), 20-24→AL=2(低), 14-19→AL=3(中等), 0-13→AL=4(高)

**每个维度评分须附带简短理由（15-25字）**，如: "需约2周CAN逆向分析，符合≤1月标准"。

## 影响等级 IL
根据威胁严重程度: Minor→IL=1, Moderate→IL=2, Major→IL=3, Severe→IL=4

## 输出格式
严格输出以下JSON（简洁优先，每个字段精简）：

{{
  "projectName": "{project}",
  "attackPaths": [
    {{
      "attackPathId": "AP_AS_Da_001",
      "attackPathName": "攻击路径名称（15字内）",
      "relatedThreats": ["CsTS_AS_Da_001"],
      "relatedDamageScenarioId": "CsDS_AS_Da_001",
      "entryPoint": "攻击入口（具体接口/信道）",
      "attackSteps": ["获取: ...", "进入: ...", "横移: ...", "实施: ..."],
      "consequence": "最终损害后果（精简）",
      "requiredCapability": "综合能力概述",
      "impactLevel": 3,
      "impactLevelLabel": "Major",
      "et": 1, "etRationale": "约1周CAN逆向，≤1周",
      "exp": 1, "expRationale": "需CAN分析技能，熟练者",
      "kn": 1, "knRationale": "需内部CAN矩阵，受限",
      "wo": 2, "woRationale": "需车辆无人值守，中等",
      "eq": 2, "eqRationale": "需CAN分析仪，专业设备"
    }}
  ]
}}

**关键规则：**
1. attackPathId中类型前缀必须与关联威胁的资产类型一致
2. 每个维度评分+理由，理由限制在25字以内
3. 五维分值范围：ET∈{{0,1,2,3,4,7}}, EXP∈[0,4], KN∈[0,3], WO∈[0,4], EQ∈[0,4]
4. impactLevel取1-4（1=Minor, 2=Moderate, 3=Major, 4=Severe）
5. 输出合法JSON"""
