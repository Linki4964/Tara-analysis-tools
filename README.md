# TARA Analysis Tools

面向汽车网络安全的 TARA（Threat Analysis and Risk Assessment）分析平台，支持资产识别、威胁分析、攻击路径、风险处置和知识库管理。

## 主要功能

- 解析 DOCX、PDF、XLSX、CSV、JSON、Markdown 和文本文件
- 使用 AI 识别非标准资产清单，并在人工确认后入库
- 按 ISO/SAE 21434 流程生成 TARA 分析结果
- 管理知识文件并进行 PostgreSQL + pgvector 混合检索
- 使用 `bge-small-zh-v1.5` 生成 512 维语义向量
- 保存分析历史，导出 Excel 或 JSON

## 环境要求

- Python 3.10+
- Node.js 18+
- PostgreSQL 14+ 与 pgvector

## 安装

```bash
git clone <repository-url>
cd Tara-analysis-tools

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

npm install
```

## 数据库

在应用使用的数据库中启用 pgvector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

确认扩展安装位置与 `DATABASE_URL` 指向的是同一个 PostgreSQL 实例：

```bash
psql "$DATABASE_URL" -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

## 配置

```bash
cp .env.example .env
```

最小配置示例：

```env
DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/<database>

# OpenAI 兼容的 BGE Embedding 服务
RAG_EMBEDDING_BASE_URL=http://127.0.0.1:7078/v1
RAG_EMBEDDING_MODEL_NAME=bge-small-zh-v1.5
RAG_EMBEDDING_DIMENSION=512

# AI 服务；也可在前端设置页面配置
API_PROVIDER=auto
```

`.env` 包含数据库密码和 API 密钥，不要提交到 Git。

## BGE Embedding 服务

本项目支持两种方式，配置了 `RAG_EMBEDDING_BASE_URL` 时优先使用独立服务。

不配置 `RAG_EMBEDDING_BASE_URL`，并设置：

```env
RAG_EMBEDDING_MODEL=/absolute/path/to/bge-small-zh-v1.5
RAG_EMBEDDING_DIMENSION=512
```

## 启动应用

分别打开两个终端：

```bash
# 后端：http://127.0.0.1:8000
source .venv/bin/activate
npm run dev:backend
```

```bash
# 前端：以 Vite 输出地址为准
npm run dev:frontend
```

健康检查：

```bash
curl http://127.0.0.1:8000/api/health
```

## RAG 代码

RAG 实现集中在 `backend/rag/`，详细模块说明见 `backend/rag/README.md`。旧向量数据库切换至 BGE 前请先备份，然后执行：

```bash
python scripts/migrate_rag_to_bge.py
```

## 项目结构

```text
backend/       FastAPI 接口、服务与 RAG
frontend/      React + TypeScript 前端
tara_core/     TARA 业务逻辑与 AI 适配
scripts/       数据库迁移和维护脚本
deploy/        服务部署模板
rules/         分析规则
```

## 构建

```bash
npm run build:frontend
```

## 安全说明

- 不要提交 `.env`、API 密钥、数据库密码、日志或上传的业务数据。
- 上传文档可能包含敏感设计信息，请按组织要求部署和授权。
- AI 结果应由专业人员复核，不应直接作为合规结论。

## License

发布公开仓库前，请添加适合项目使用方式的开源许可证。
