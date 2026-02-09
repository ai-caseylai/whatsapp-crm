-- 創建向量相似度搜索函數
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  filter_session_id text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  content text,
  session_id text,
  source_type text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rag_knowledge.id,
    rag_knowledge.content,
    rag_knowledge.session_id,
    rag_knowledge.source_type,
    rag_knowledge.metadata,
    1 - (rag_knowledge.embedding <=> query_embedding) AS similarity
  FROM rag_knowledge
  WHERE 
    (filter_session_id IS NULL OR rag_knowledge.session_id = filter_session_id)
    AND rag_knowledge.embedding IS NOT NULL
    AND 1 - (rag_knowledge.embedding <=> query_embedding) > match_threshold
  ORDER BY rag_knowledge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents IS '向量相似度搜索函數 - 使用餘弦相似度查找最相關的文檔';
