# TARA Analysis Tools

面向汽车网络安全的 TARA（Threat Analysis and Risk Assessment）分析平台，覆盖相关项定义、资产识别、威胁分析、攻击路径和风险处置流程。

## 功能

- 从 DOCX、PDF、XLSX、CSV、JSON、Markdown 和文本文件提取内容
- 按 ISO/SAE 21434 工作流生成并维护 TARA 分析结果
- 基于 STRIDE 构建威胁场景和攻击路径
- 计算影响等级、攻击可行性和风险处置建议
- 管理资产、漏洞、法规、攻击路径、黄金案例及纠偏规则
- 使用 PostgreSQL、pgvector 与本地 BGE 模型进行混合检索
- AI 解析非标准资产清单，经人工确认后批量入库
- 保存分析历史并导出 Excel/JSON

## 技术栈

- 前端：React、TypeScript、Vite
- 后端：FastAPI、Python
- 数据库：PostgreSQL、pgvector
- 向量模型：`bge-small-zh-v1.5`
- AI：支持 Anthropic、OpenAI、DeepSeek 及 OpenAI 兼容的本地服务

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
npm install
```

### 2. 准备 PostgreSQL

安装 PostgreSQL 和 [pgvector](https://github.com/pgvector/pgvector)，然后在项目数据库中启用扩展：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 3. 配置环境

复制 `.env.example` 为 `.env`，按需设置：

```env
DATABASE_URL=<postgresql-connection-string>
RAG_EMBEDDING_MODEL=<local-bge-model-directory>
API_PROVIDER=<provider-name>
```

API 密钥仅保存在本地 `.env` 或通过设置页面配置。不要将 `.env` 提交到版本库。

### 4. 启动

```bash
npm run dev:backend
npm run dev:frontend
```

前后端需分别在两个终端中运行。

## RAG

RAG 模块位于 `backend/rag/`，包括：

- 本地 BGE Embedding
- 七类领域知识库
- 文档分类与定向入库
- 向量与关键词混合检索
- PostgreSQL/pgvector 存储边界

详细说明见 `backend/rag/README.md`。

旧向量库切换到 BGE 后，可执行：

```bash
python scripts/migrate_rag_to_bge.py
```

迁移前请备份数据库。

## 项目结构

```text
backend/       FastAPI 接口、服务与 RAG
frontend/      React 前端
tara_core/     TARA 业务逻辑、提示词与 AI 适配
scripts/       数据库初始化、迁移与验证脚本
rules/         TARA 分析规则
```

## 构建

```bash
npm run build:frontend
```

## 安全提示

- 不要提交 `.env`、API 密钥、数据库密码或生产数据。
- 上传的文档可能包含敏感设计信息，请根据组织的数据安全要求部署。
- AI 生成的分析结果应由具备资质的工程师审核，不应直接作为合规结论。

## License

提交公开仓库前，请根据项目使用场景补充合适的开源许可证。
