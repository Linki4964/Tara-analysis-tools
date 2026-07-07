def build_structure_docx_prompts(extracted_text: str, extracted_html: str = "", filename: str = ""):
    content_for_ai = extracted_html or extracted_text
    system_prompt = """你是一个精确的 JSON 数据转换器。你的任务是将从 DOCX 文档中提取的内容转换为结构化的 JSON 格式。
只返回 JSON，不要有其他内容。"""
    user_prompt = f"""请将以下从 DOCX 文档中提取的内容转换为结构化的 JSON 格式。

要求:
1. 仔细分析内容，识别出数据的逻辑结构（如：需求列表、配置项、功能定义、检查清单等）
2. 如果内容中包含表格，将表格数据转为 JSON 数组，每行一个对象
3. 保留所有原始文本内容，不要遗漏任何信息
4. 添加有意义的字段名（使用英文 camelCase）
5. 如果有层级关系，用嵌套 JSON 表示
6. 返回纯 JSON，不要包含任何解释文字，不要用 markdown 代码块包裹

文件名：{filename or '未命名文件'}

文档内容如下:
{content_for_ai[:30000]}"""
    return system_prompt, user_prompt
