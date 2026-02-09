-- 第一步：啟用 pgvector 擴展（必須在創建表之前）
CREATE EXTENSION IF NOT EXISTS vector;

-- 第二步：創建 RAG 知識庫表
CREATE TABLE IF NOT EXISTS rag_knowledge (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(768),  -- Jina embeddings 是 768 維
    session_id TEXT,
    source_type TEXT,  -- 'system', 'contact', 'conversation', 'manual'
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 第三步：創建索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_session_id ON rag_knowledge(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_source_type ON rag_knowledge(source_type);
CREATE INDEX IF NOT EXISTS idx_rag_knowledge_created_at ON rag_knowledge(created_at DESC);

-- 為向量相似度搜索創建索引（使用 ivfflat 索引）
-- 注意：只有在有大量數據（>1000條）時才需要創建向量索引
-- CREATE INDEX IF NOT EXISTS idx_rag_knowledge_embedding ON rag_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE rag_knowledge IS 'RAG 知識庫表，存儲向量化的知識文檔';
COMMENT ON COLUMN rag_knowledge.embedding IS '768維向量，由 Jina AI Embeddings 生成';
COMMENT ON COLUMN rag_knowledge.source_type IS '知識來源類型：system(系統), contact(聯絡人), conversation(對話), manual(手動添加)';
