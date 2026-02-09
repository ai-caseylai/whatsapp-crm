# WhatsApp 數據向量化完整指南

## 📋 執行步驟

### 步驟 1: 創建數據庫表

請在 Supabase SQL Editor 中執行以下 SQL：

```sql
-- 啟用 pgvector 擴展（如果尚未啟用）
CREATE EXTENSION IF NOT EXISTS vector;

-- 創建 RAG 知識庫表
CREATE TABLE IF NOT EXISTS rag_knowledge (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(768),
    session_id TEXT,
    source_type TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_session_id ON rag_knowledge(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_source_type ON rag_knowledge(source_type);
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_created_at ON rag_knowledge(created_at DESC);
```

### 步驟 2: 運行向量化腳本

```bash
# 執行同步和向量化
node sync-vectorize-to-db.js

# 或在後台執行
nohup node sync-vectorize-to-db.js > sync-vectorize.log 2>&1 &

# 查看進度
tail -f sync-vectorize.log
```

### 步驟 3: 驗證結果

```bash
# 檢查向量化狀態
node check-embeddings-status.js
```

## 📊 預期結果

- 總文檔數: ~3,879 個
- 處理時間: 約 10-15 分鐘
- 成功率: 95%+

## 🔍 監控命令

```bash
# 查看進程
ps aux | grep "sync-vectorize-to-db"

# 實時日誌
tail -f sync-vectorize.log

# 檢查進度
bash check-vectorize-progress.sh
```
