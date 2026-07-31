def build_asset_prompt(project_name: str = "", system_description: str = "", optional_info: str = ""):
    project = project_name or "未命名项目"
    prompt = f"""你是一名汽车网络安全工程师。

请根据ISO/SAE 21434标准，分析以下系统描述，识别所有值得保护的安全资产（Asset）。

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
## 资产分类标准（5类）

| 类型 | 编号前缀 | 判据 | 示例 |
|------|---------|------|------|
| 数据流 | `AS_Da_` | 动态传输中的信号/指令（有发送方→接收方） | 远程启动信号（APP→TBOX→VCU） |
| 硬件 | `AS_Hw_` | 物理设备/芯片/ECU/总线 | VCU、BCM、整车CAN总线 |
| 软件 | `AS_Sw_` | 代码/固件/OS/协议栈（可刷写/升级） | MCU固件包、CAN协议栈 |
| 外部实体 | `AS_Ee_` | 系统边界外的交互终端/平台 | TSP平台、APP、外部诊断设备 |
| 数据 | `AS_Dt_` | 静态存储的信息/密钥/日志 | 安全启动密钥、VIN、故障日志 |

### 分类决策树
外部?→AS_Ee_ | 物理设备?→AS_Hw_ | 代码/固件?→AS_Sw_ | 动态传输?→AS_Da_ | 静态存储?→AS_Dt_

### 各类资产描述句式（精简版）

**数据流**: [动词]+[发起方/输入]+经[中转]+完成[业务逻辑]+将[结果]反馈至[目的地]。
  例: "接收APP/TSP远程启动指令，经TBOX转发至VCU，完成状态与权限校验，控制高压及空调启停，将执行状态反馈至TSP与APP。"

**硬件**: [名称]：接入[总线/ECU]，负责[核心功能]，存储[数据]，校验[完整性]，执行[安全防护逻辑]。
**软件**: [名称]：[包含的算法/服务]，用于[业务功能]，升级过程[安全机制]，防止[篡改/植入]。
**外部实体**: [名称]：作为[外部角色]，通过[接入方式]执行[操作]，受[权限管控]限制，[安全边界说明]。
**数据**: [名称]：作为[安全凭证/标识/记录]，在[使用场景]执行[校验/追溯]，[加密存储]，防止[仿冒/泄露]。

## 损害场景规范

每个资产按安全属性（保密性/完整性/可用性）拆分，每个组合至少2个损害场景。

**场景ID**: `CsDS_AS_<类型缩写>_<序号>`（如CsDS_AS_Da_001）

**描述公式**: [资产名称]的[安全属性]遭到破坏，[攻击行为]，[具体影响后果]。

**S/F/O/P评分**（每个维度须附简短理由）:
- S(安全性): 0=无伤害, 10=轻度/中度, 100=严重/威胁生命
- F(财产): 0=无影响, 1-10=可接受, 100=重大, 1000=灾难性
- O(操作): 0=无影响, 1=降级, 3-10=部分失效, 100=无法工作
- P(隐私): 0=无影响, 10=轻微, 100=严重

**综合等级**: Total=S+F+O+P → ≤20:Minor, 20-100:Moderate, 100-1000:Major, >1000:Severe

## 输出格式
严格输出JSON（每个字段精简，理由控制在20字内）：

{{
  "projectName": "{project}",
  "assets": [
    {{
      "assetId": "AS_Da_001",
      "assetName": "远程启动/关闭指令流（APP/TSP→TBOX→VCU）",
      "assetType": "数据流",
      "description": "接收APP/TSP远程启动指令，经TBOX转发VCU，校验后控制高压空调启停，反馈状态",
      "valueRationale": "远程控车核心指令流，被篡改可导致非预期车辆操作",
      "securityProperties": {{"confidentiality": true, "integrity": true, "availability": false, "authenticity": true}},
      "damageScenarios": [
        {{
          "scenarioId": "CsDS_AS_Da_001",
          "scenarioName": "远程启动信号机密性泄露",
          "description": "远程启动信号的机密性遭到破坏，可窃听获取指令交互规律，掌握车辆上下电时机",
          "severity": "Major",
          "affectedProperty": "Confidentiality",
          "safety": 0, "safetyRationale": "仅被动监听，无伤害",
          "financial": 100, "financialRationale": "指令泄露可导致重大财务损失",
          "operational": 0, "operationalRationale": "不改动控制逻辑",
          "privacy": 10, "privacyRationale": "暴露使用习惯，未涉及身份信息"
        }}
      ]
    }}
  ]
}}

**规则：**
1. 每资产≥2个damageScenarios，按保密性→完整性→可用性顺序编号
2. assetType精确填：数据流/硬件/软件/外部实体/数据
3. 描述按对应类别句式精简编写，每个字段控制长度
4. S/F/O/P评分须附简短理由（15-25字）
5. 输出合法JSON，assets数组不为空"""
    return prompt
