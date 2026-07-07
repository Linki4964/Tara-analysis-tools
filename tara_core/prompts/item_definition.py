def build_item_definition_prompts(extracted_text: str, filename: str = ""):
    system_prompt = """你是一名汽车网络安全工程师，专门从事TARA分析。
你的任务是从上传的文档内容中识别并列出所有的"相关项"（Item）。

相关项是系统中需要被分析的功能模块或子系统。每个相关项通常包含：
- 一个编号（如 RQ-XXX-001）
- 一个名称/标题
- 功能描述
- 包含的子功能列表"""

    user_prompt = f"""请从以下文档内容中，识别并列出所有的相关项（Item）。

要求：
1. 仔细阅读文档，找出所有独立的功能需求或系统模块
2. 每个相关项作为一个独立条目，包含编号、名称、描述和子功能
3. 如果文档中包含表格，将表格中的每一行作为一个相关项
4. 保留所有技术细节的准确性
5. 同时生成一段总结性的系统描述文本，用于后续TARA资产识别分析

文件名：{filename or '未命名文件'}

文档内容：
{extracted_text[:30000]}

请严格按照以下JSON格式输出，不要包含任何其他文字或markdown标记：

{{
  "items": [
    {{
      "itemId": "RQ-XXX-001",
      "itemName": "相关项名称",
      "description": "对该相关项的详细描述",
      "functions": [
        {{
          "functionId": "FNC-001",
          "functionName": "子功能名称",
          "description": "子功能描述"
        }}
      ]
    }}
  ],
  "systemDescription": "将所有相关项总结为一段连贯的系统描述文本，用于后续资产识别分析。包含系统架构、通信方式、ECU交互、外部接口等信息。"
}}

请确保 items 数组不为空，输出合法 JSON。"""

    return system_prompt, user_prompt
