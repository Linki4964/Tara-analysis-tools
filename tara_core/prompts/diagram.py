"""Prompts for AI-assisted ISO/SAE 21434 architecture drawing (vector-image style).

The AI analyses a natural-language description of a vehicle / embedded system and
emits a semantic ArchModel. The frontend auto-layouts it into a standards-compliant
vector architecture image whose glyph set is fixed:

- solid rectangle  -> component  (ECU / gateway / bus / external system ...)
- circle           -> service / interface hosted on a component
- dashed rectangle -> boundary / security domain (incl. the surrounding Item frame)
- arrow (single / double) -> data flow direction (mixed endpoints are allowed:
  service<->service, service<->component, component<->component)

The semantic categories below must stay in sync with the frontend diagram module
(frontend/src/diagram/types.ts).
"""

# (kind, category, 类别中文名, 典型用途说明) —— 供部件作可选 kind 标注
KIND_CATALOG = [
    # ---- 硬件 / 物理部件 ----
    ("ecu", "hardware", "硬件", "ECU 控制器 / 电子控制单元"),
    ("gateway", "hardware", "硬件", "网关（车载网关 / 中央网关）"),
    ("sensor", "hardware", "硬件", "传感器（摄像头 / 雷达 / 温度等）"),
    ("actuator", "hardware", "硬件", "执行器（电机 / 阀体 / 制动等）"),
    ("controller", "hardware", "硬件", "通用控制器（MCU / SoC）"),
    ("obd", "hardware", "硬件", "OBD 诊断接口"),
    ("hw_other", "hardware", "硬件", "其他硬件"),
    # ---- 软件 / 逻辑单元 ----
    ("app", "software", "软件", "应用软件 / APP"),
    ("firmware", "software", "软件", "嵌入式固件"),
    ("os", "software", "软件", "操作系统 OS / RTOS"),
    ("service", "software", "软件", "后台服务（云端 / 后端）"),
    ("middleware", "software", "软件", "通信中间件"),
    ("logic", "software", "软件", "逻辑功能单元"),
    ("sw_other", "software", "软件", "其他软件"),
    # ---- 通信总线 / 网络（作为矩形部件表达）----
    ("can", "network", "网络", "CAN / CAN FD 总线"),
    ("lin", "network", "网络", "LIN 总线"),
    ("flexray", "network", "网络", "FlexRay 总线"),
    ("ethernet", "network", "网络", "车载以太网 Ethernet / SOME/IP"),
    ("wifi", "network", "网络", "Wi-Fi"),
    ("bluetooth", "network", "网络", "蓝牙 BLE"),
    ("cellular", "network", "网络", "蜂窝网络 4G / 5G / V2X"),
    ("usb", "network", "网络", "USB 接口"),
    ("protocol", "network", "网络", "私有协议链路"),
    # ---- 外部实体（isExternal=true，画在 Item 边界外）----
    ("external", "external", "外部", "外部互联系统"),
    ("actor", "external", "外部", "用户 / 角色（驾驶员 / 运维）"),
    ("attacker", "external", "外部", "攻击者 / 威胁行为者"),
    ("vendor", "external", "外部", "第三方服务商（云 / TSP）"),
    ("device", "external", "外部", "外部设备（手机 / 钥匙 / 诊断仪）"),
    # ---- 安全控件（作为部件表达）----
    ("firewall", "control", "安全控件", "网络防火墙"),
    ("ids", "control", "安全控件", "入侵检测系统 IDS / IPS"),
    ("hsm", "control", "安全控件", "安全硬件模块 HSM / 安全芯片"),
    ("auth", "control", "安全控件", "认证与访问控制"),
    ("crypto", "control", "安全控件", "加密模块 / 签名服务"),
    ("secure_storage", "control", "安全控件", "安全存储 / 保险柜"),
]

VALID_KINDS = {entry[0] for entry in KIND_CATALOG}
VALID_CATEGORIES = ("hardware", "software", "network", "external", "control")
KIND_TO_CATEGORY = {kind: cat for kind, cat, _cat_cn, _desc in KIND_CATALOG}

# (kind, 说明) —— 服务（部件上的圆形接口）可选的 kind 标注
SERVICE_KIND_CATALOG = [
    ("api", "应用 / 远程接口"),
    ("function", "业务功能接口"),
    ("protocol", "协议接口（CAN / SOME-IP / UDS 等）"),
    ("diag", "诊断接口（UDS / OBD）"),
    ("personal", "个人数据"),
    ("location", "位置数据"),
    ("key", "密钥"),
    ("credential", "凭据口令"),
    ("cert", "数字证书"),
    ("log", "日志记录"),
    ("data", "通用数据 / 存储"),
]
VALID_SERVICE_KINDS = {entry[0] for entry in SERVICE_KIND_CATALOG}

BOUNDARY_KINDS = ("security_domain", "trust_boundary")

# 容量上限（后端裁剪与 prompt 双重保险）
CAPS = {
    "components": 40,
    "services_per_component": 8,
    "services": 80,
    "boundaries": 8,
    "flows": 120,
}

_CAT_CN = {
    "hardware": "硬件 / 物理部件",
    "software": "软件 / 逻辑单元",
    "network": "通信总线 / 网络",
    "external": "外部实体",
    "control": "安全控件",
}


def _category_guide() -> str:
    lines = ["- `hardware`：硬件 / 物理部件（ECU、网关、传感器、执行器、控制器、OBD 等）"]
    lines.append("- `software`：软件 / 逻辑单元（应用、固件、OS、后台服务、中间件等）")
    lines.append("- `network`：通信总线 / 网络（CAN、LIN、FlexRay、以太网、蓝牙、蜂窝等，**必须画成矩形部件**，而不是特殊图形）")
    lines.append("- `external`：外部实体（手机 APP、云 TSP、攻击者、诊断仪等，一律 `isExternal: true`）")
    lines.append("- `control`：安全控件（防火墙、IDS、HSM、认证、加密、安全存储等）")
    return "\n".join(lines)


def build_diagram_system_prompt() -> str:
    return (
        "你是一名汽车网络安全架构图绘制专家，严格遵循 ISO/SAE 21434 相关项（Item）定义阶段"
        "的架构图规范。你只输出一个合法的 JSON 对象，不要包含 markdown、注释或任何解释文字。"
        "输出的 JSON 必须完全符合给定的 schema，且只使用四种图元表达：实线矩形=部件、"
        "圆形=部件上承载的服务/接口、虚线矩形=边界/安全域、单/双箭头=数据流方向。"
    )


def build_diagram_prompt(
    project_name: str = "",
    description: str = "",
    current_model: dict | None = None,
) -> str:
    """Build the user prompt.

    current_model is the full ArchModel already on the canvas (modify mode). When
    present the AI must return the COMPLETE updated model, copying ids/names of
    every untouched element verbatim (full-model round-trip, no incremental merge).
    """
    project = (project_name or "").strip() or "未命名相关项"

    kind_lines = "\n".join(
        f"- `{kind}`（{_CAT_CN.get(cat, cat)}）：{desc}"
        for kind, cat, _cat_cn, desc in KIND_CATALOG
    )
    svc_kind_lines = "\n".join(f"- `{kind}`：{desc}" for kind, desc in SERVICE_KIND_CATALOG)

    cap_text = (
        f"部件 ≤ {CAPS['components']}，每部件服务 ≤ {CAPS['services_per_component']}，"
        f"服务总数 ≤ {CAPS['services']}，边界 ≤ {CAPS['boundaries']}，数据流 ≤ {CAPS['flows']}。"
        "宁可少而准确，也不要无意义的堆砌。"
    )

    if current_model:
        existing = _compact_model(current_model)
        scope = (
            "## 模式：修改（modify）\n"
            "当前画布已存在如下完整模型。请按用户描述对模型进行增 / 删 / 改，并输出**修改后的完整模型**：\n"
            "- 未被修改的元素必须**原样逐项照抄**，id 与 name 一个字符都不能变；\n"
            "- 仅当用户明确要求删除某元素时才整体不输出它，禁止为了省篇幅丢弃任何既有元素；\n"
            "- 新增元素用不与现有冲突的新 id。\n\n"
            f"当前模型（供你继承与修改）：\n```json\n{existing}\n```\n"
        )
    else:
        scope = (
            "## 模式：新建（create）\n"
            "画布当前为空。请依据用户描述从零绘制整车 / 系统架构图。\n"
        )

    prompt = f"""请依据下面的需求描述，绘制符合 ISO/SAE 21434 相关项（Item）定义阶段的系统架构图。

## 项目名称
{project}

## 用户需求描述
{description}

{scope}
## 图元与语义规则（务必遵守）
1. 图形只用四种：**实线矩形 = 部件**；**圆形 = 部件上承载的服务/接口**；**虚线矩形 = 边界/安全域**；**单/双箭头 = 数据流方向**。禁止发明卡片、总线图标等其它多余形状。
2. **部件（component）表达一切"宿主"**：ECU、网关、传感器、域控制器、云 TSP、手机 APP、攻击者、防火墙、总线等全部是矩形部件。用 category 区分：
{_category_guide()}
3. **总线用 `network` 类部件表达网络拓扑**（如 TBOX → 整车 CAN 总线 → VCU 拆成两条数据流），**不要**用一条数据流直接连两个 ECU 来代替总线。
4. **服务（service）是部件上承载的、具有安全含义的接口**：只在接口、数据进出点、敏感承载点建立服务（如远程控制、UDS 诊断、OTA 下载、蓝牙配对、鉴权、密钥存储）。服务 `name` 用清晰中文。敏感数据（个人数据、位置、密钥、凭据、日志等）作为服务或数据流标注，**不要**画成独立部件。服务可选 kind：
{svc_kind_lines}
5. **边界（boundary）= 安全域 / 信任边界**：用于圈定图内范围与隔离域，`kind` 取 `security_domain`（安全域）或 `trust_boundary`（信任边界）。部件用 `boundaryId` 归属某个边界。
6. **外部实体一律 `isExternal: true`**（手机 APP、TSP、诊断仪、攻击者等），它们会渲染在 Item 虚线外框之外；从外部到内部的跨边界数据流是允许的（表达穿越信任边界）。
7. **数据流（flow）方向代表数据流动方向**：`arrow: "single"` = 单向，`arrow: "double"` = 双向。端点**可以灵活混合**：服务↔服务、服务↔部件、部件↔部件都允许，只要语义正确。同宿主（同一部件内）的流没有意义，不要输出。
8. 边界数量适中（整车图推荐 1~3 个，如"车内部件域""乘客区"），不要用边界包住外部实体。
9. 命名：部件与服务名使用可辨识的中文；id 用 ASCII 短串（`c-xxx` / `s-xxx` / `b-xxx` / `f-xxx`，最多 64 字符，只用字母数字 `_` `-`），新增 id 必须全局唯一。
10. {cap_text}

## 输出 JSON Schema（严格按此结构，不含任何坐标，坐标由前端自动布局）
{{
  "plan": "用 2~4 句话说明绘制思路",
  "summary": "本次绘制/修改的总结",
  "item": {{ "id": "item-001", "name": "相关项名称", "description": "" }},
  "boundaries": [ {{ "id": "b-xxx", "name": "安全域名称", "kind": "security_domain", "description": "" }} ],
  "components": [
    {{ "id": "c-xxx", "name": "部件名", "kind": "ecu", "category": "hardware",
       "isExternal": false, "boundaryId": "b-xxx", "description": "" }}
  ],
  "services": [
    {{ "id": "s-xxx", "name": "服务名", "componentId": "c-xxx", "kind": "diag", "description": "" }}
  ],
  "flows": [
    {{ "id": "f-001", "label": "数据/报文名", "source": {{"kind": "service", "id": "s-xxx"}},
       "target": {{"kind": "component", "id": "c-yyy"}}, "arrow": "single", "reason": "" }}
  ]
}}

规则：
- 每个 `service` 的 `componentId` 必须指向已输出的 `component`；`component` 的 `boundaryId` 可为 null（直属 Item）；
- 每条 `flow` 的 `source` / `target` 的 `id` 必须引用已输出的部件或服务 id；`label` 为空表示无名箭头；
- `arrow` 只允许 `"single"` 或 `"double"`；`category` 只允许 {list(VALID_CATEGORIES)}；
- `plan` 与 `summary` 为字符串；输出必须是可以直接 json.loads 的裸 JSON，不要 markdown。

## 参考示例（新建一个 TBOX 远程控制系统，展示结构与端点混连）
{{
  "plan": "先识别车内核心 ECU 与 CAN 总线拓扑，再补充外部 APP/TSP 与攻击面，最后圈出安全域。",
  "summary": "绘制了 TBOX、VCU、整车 CAN 与网关，并标注了远程控制、UDS 诊断等服务及跨边界数据流。",
  "item": {{ "id": "item-001", "name": "TBOX 远程控制系统", "description": "" }},
  "boundaries": [ {{ "id": "b-veh", "name": "车内部件域", "kind": "security_domain", "description": "" }} ],
  "components": [
    {{ "id": "c-tbox", "name": "TBOX 主控 ECU", "kind": "ecu", "category": "hardware", "isExternal": false, "boundaryId": "b-veh", "description": "" }},
    {{ "id": "c-vcu", "name": "VCU 整车控制器", "kind": "ecu", "category": "hardware", "isExternal": false, "boundaryId": "b-veh", "description": "" }},
    {{ "id": "c-can", "name": "整车 CAN 总线", "kind": "can", "category": "network", "isExternal": false, "boundaryId": "b-veh", "description": "" }},
    {{ "id": "c-app", "name": "车主手机 APP", "kind": "app", "category": "external", "isExternal": true, "boundaryId": null, "description": "" }},
    {{ "id": "c-tsp", "name": "TSP 云端平台", "kind": "vendor", "category": "external", "isExternal": true, "boundaryId": null, "description": "" }}
  ],
  "services": [
    {{ "id": "s-tbox-ctrl", "name": "远程控制", "componentId": "c-tbox", "kind": "api", "description": "" }},
    {{ "id": "s-tbox-diag", "name": "UDS 诊断", "componentId": "c-tbox", "kind": "diag", "description": "" }},
    {{ "id": "s-can-bus", "name": "CAN 报文", "componentId": "c-can", "kind": "protocol", "description": "" }},
    {{ "id": "s-vcu-ctrl", "name": "整车控制", "componentId": "c-vcu", "kind": "function", "description": "" }}
  ],
  "flows": [
    {{ "id": "f-001", "label": "远程控制指令", "source": {{"kind": "service", "id": "s-tbox-ctrl"}}, "target": {{"kind": "service", "id": "s-can-bus"}}, "arrow": "single", "reason": "" }},
    {{ "id": "f-002", "label": "CAN 报文", "source": {{"kind": "service", "id": "s-can-bus"}}, "target": {{"kind": "service", "id": "s-vcu-ctrl"}}, "arrow": "single", "reason": "" }},
    {{ "id": "f-003", "label": "下发指令", "source": {{"kind": "component", "id": "c-app"}}, "target": {{"kind": "component", "id": "c-tsp"}}, "arrow": "double", "reason": "" }},
    {{ "id": "f-004", "label": "远程指令", "source": {{"kind": "component", "id": "c-tsp"}}, "target": {{"kind": "service", "id": "s-tbox-ctrl"}}, "arrow": "single", "reason": "" }},
    {{ "id": "f-005", "label": "诊断请求", "source": {{"kind": "component", "id": "c-app"}}, "target": {{"kind": "service", "id": "s-tbox-diag"}}, "arrow": "double", "reason": "" }}
  ]
}}
"""
    return prompt


def _compact_model(model: dict) -> str:
    """Serialize a canonical ArchModel into compact JSON for prompt injection."""
    import json

    slim = {}
    for key in ("item", "components", "services", "boundaries", "flows"):
        if key == "item":
            it = model.get("item") or {}
            slim["item"] = {
                "id": it.get("id", ""),
                "name": it.get("name", ""),
                "description": it.get("description", ""),
            }
        else:
            entries = model.get(key)
            if isinstance(entries, list):
                slim[key] = [
                    {kk: v for kk, v in (e or {}).items() if kk in _FIELDS.get(key, set())}
                    for e in entries
                ]
            else:
                slim[key] = []
    return json.dumps(slim, ensure_ascii=False, indent=1)


_FIELDS = {
    "components": {
        "id", "name", "kind", "category", "isExternal", "boundaryId", "description",
    },
    "services": {"id", "name", "componentId", "kind", "description"},
    "boundaries": {"id", "name", "kind", "description"},
    "flows": {
        "id", "label", "source", "target", "arrow", "reason",
    },
}
