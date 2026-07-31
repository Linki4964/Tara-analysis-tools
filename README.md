# TARA Analysis Tools

面向汽车网络安全 TARA（Threat Analysis and Risk Assessment）的分析平台，支持从需求/系统文档中提取相关项定义，并按 ISO/SAE 21434 工作流完成资产识别、威胁分析、攻击路径分析和风险处置方案生成。

## 技术栈

- 前端：React + TypeScript + Vite
- 后端：Python + FastAPI
- 数据库：PostgreSQL，用于保存每次完整 TARA 运行历史
- 业务内核：`tara_core` Python 模块
- AI Provider：DeepSeek 或 Anthropic，可通过环境变量切换

## 项目结构

```text
.
├── frontend/              # React + TypeScript 前端应用
│   ├── src/api/           # API 客户端封装
│   ├── src/components/    # 可复用 UI 组件
│   ├── src/types/         # TARA 领域类型定义
│   └── src/App.tsx        # 五步 TARA 工作台主流程
├── backend/               # FastAPI 后端
│   ├── api/               # HTTP 路由
│   ├── core/              # 后端配置
│   ├── services/          # 文件解析等后端服务
│   └── main.py            # FastAPI 应用入口
├── tara_core/             # 核心业务模块
│   ├── prompts/           # 独立提示词模板
│   ├── services.py        # TARA 工作流业务逻辑
│   ├── llm.py             # LLM 调用适配
│   └── json_utils.py      # AI JSON 响应清洗
├── docx_to_json.py        # DOCX 转 JSON CLI 辅助脚本
├── scripts/               # 数据库初始化脚本
├── requirements.txt       # Python 依赖
├── package.json           # 前端/后端开发脚本
└── .env.example           # 环境变量示例
```

## 功能流程

1. 相关项定义：上传 `.docx`、`.pdf`、`.txt`、`.json`、`.md`、`.csv` 文档，或手动输入系统描述。
2. 资产识别：识别系统中需要保护的 Data、Software、ECU、Key、Service 等资产。
3. 威胁分析：基于 STRIDE 模型分析资产面临的威胁和损害场景。
4. 攻击路径：从攻击者视角构建攻击入口、步骤、能力要求和可行性。
5. 风险处置：生成安全控制措施、处置决策、优先级、残余风险和验证方法。

## 环境准备

### 1. Python 依赖

```bash
pip install -r requirements.txt
```

### 2. Node 依赖

```bash
npm install
```

### 3. 配置环境变量

复制示例文件并填写密钥：

```bash
cp .env.example .env
```

常用配置：

```env
API_PROVIDER=auto

DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

DATABASE_URL=postgresql://postgres:your-postgres-password@localhost:5433/tara_analysis
```

### 4. 初始化 PostgreSQL

项目默认使用本地 PostgreSQL 保存历史记录。初始化数据库：

```powershell
$env:PGPASSWORD="your-postgres-password"
.\scripts\init_database.ps1 -Port 5433 -User postgres -Database tara_analysis
```

如果不想通过环境变量传密码，也可以直接运行脚本后按提示输入密码。脚本会自动创建 `tara_analysis` 数据库，并执行 `scripts/init_database.sql` 创建 `runs` 与 `step_results` 表。

如果 PostgreSQL 客户端命令 `psql` 没有加入 PATH，也可以直接使用 Python 初始化：

```powershell
python .\scripts\init_database.py --host localhost --port 5433 --user postgres --password your-postgres-password --database tara_analysis
```

## 启动开发环境

### 启动后端

```bash
npm run dev:backend
```

后端地址：

```text
http://localhost:8000
```

健康检查：

```text
http://localhost:8000/api/health
```

### 启动前端

```bash
npm run dev:frontend
```

前端地址：

```text
http://localhost:5173
```

Vite 开发服务器会将 `/api` 请求代理到 `http://localhost:8000`。

## 构建前端

```bash
npm run build:frontend
```

构建产物位于：

```text
frontend/dist/
```

## API 概览

所有接口以 `/api` 为前缀：

- `GET /api/health`
- `POST /api/upload-extract`
- `POST /api/structure-docx`
- `POST /api/extract-item-definition`
- `POST /api/generate-assets`
- `POST /api/analyze-threats`
- `POST /api/generate-attack-paths`
- `POST /api/generate-risk-treatment`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `POST /api/runs`
- `POST /api/runs/{run_id}/complete`
- `DELETE /api/runs/{run_id}`

运行中的每个分析项目会在 PostgreSQL 中保存项目记录和各步骤结果。前端首页和历史页可查看、恢复和删除历史记录。

## 可维护性说明

- 前端 API 调用集中在 `frontend/src/api/`，便于替换后端地址或统一错误处理。
- 前端领域类型集中在 `frontend/src/types/tara.ts`，避免组件间重复定义结构。
- 后端 HTTP 路由集中在 `backend/api/routes.py`，文件解析等基础服务放在 `backend/services/`。
- TARA 核心业务与提示词放在 `tara_core/`，不绑定 FastAPI，可被 CLI、测试或其他后端复用。
- 提示词按分析阶段拆分到 `tara_core/prompts/`，后续调整分析口径不需要改动 Web 层。

## 备注

旧版 `public/` 静态前端和 Node 静态服务器已移除。当前唯一前端入口是 `frontend/` 下的 React + TypeScript 应用。

