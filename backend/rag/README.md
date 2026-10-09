# TARA RAG 子系统

该目录集中放置 RAG 的模型、检索、摄入和存储边界，方便独立审核。

## 审核顺序

1. `config.py`：本地模型路径、512 维和查询指令。
2. `embeddings.py`：BGE 模型加载、文档/查询编码和归一化。
3. `registry.py`：七类知识库注册信息。
4. `repository.py`：知识记录持久化边界。
5. `retriever.py`：混合检索入口。
6. `ingestion.py`：文档分类、分块与定向入库入口。

底层 PostgreSQL CRUD 暂由 `backend/services/knowledge.py` 实现，RAG 外部代码只应通过
`backend.rag` 的公开接口访问，后续可以替换存储实现而不影响 API 路由。

## Embedding 约定

- 模型：本地 `bge-small-zh-v1.5`
- 输出维度：512
- 文档：原文直接编码
- 查询：前置 `为这个句子生成表示以用于检索相关文章：`
- 相似度：归一化向量的 cosine similarity
- 数据库：PostgreSQL `vector(512)` + HNSW

## 旧数据库迁移

先备份数据库，再执行：

```powershell
python scripts/migrate_rag_to_bge.py
```

脚本保留全部知识内容，仅删除旧向量、转换向量列、用 BGE 全量重算并重建 HNSW 索引。
