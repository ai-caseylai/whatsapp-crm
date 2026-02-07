-- 快速修复 LID 映射问题（仅修复函数，不创建视图）

-- 1. 删除旧的函数和视图
DROP FUNCTION IF EXISTS get_merged_messages(TEXT, TEXT);
DROP VIEW IF EXISTS whatsapp_contacts_merged;

-- 2. 创建映射表（如果不存在）
CREATE TABLE IF NOT EXISTS whatsapp_jid_mapping (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    lid_jid TEXT NOT NULL,
    traditional_jid TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, lid_jid),
    UNIQUE(session_id, traditional_jid)
);

-- 3. 添加索引
CREATE INDEX IF NOT EXISTS idx_jid_mapping_session_lid ON whatsapp_jid_mapping(session_id, lid_jid);
CREATE INDEX IF NOT EXISTS idx_jid_mapping_session_trad ON whatsapp_jid_mapping(session_id, traditional_jid);

-- 4. 插入 Casey 和 黃sir沈香林 的映射
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '69827679002840@lid', '85291969997@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 5. 创建简化的消息合并函数（不包含 media_path）
CREATE OR REPLACE FUNCTION get_merged_messages(
    p_session_id TEXT,
    p_jid TEXT
) RETURNS TABLE (
    message_id TEXT,
    session_id TEXT,
    remote_jid TEXT,
    from_me BOOLEAN,
    participant TEXT,
    participant_phone TEXT,
    message_timestamp TIMESTAMP WITH TIME ZONE,
    push_name TEXT,
    message_type TEXT,
    content TEXT,
    attachment_path TEXT,
    full_message_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (m.message_id)
        m.message_id,
        m.session_id,
        m.remote_jid,
        m.from_me,
        m.participant,
        m.participant_phone,
        m.message_timestamp,
        m.push_name,
        m.message_type,
        m.content,
        m.attachment_path,
        m.full_message_json,
        m.created_at,
        m.updated_at
    FROM whatsapp_messages m
    WHERE m.session_id = p_session_id
    AND (
        -- 直接匹配
        m.remote_jid = p_jid
        -- 如果 p_jid 是传统 JID，查找对应的 LID
        OR (p_jid LIKE '%@s.whatsapp.net' AND m.remote_jid IN (
            SELECT mapping.lid_jid FROM whatsapp_jid_mapping mapping
            WHERE mapping.session_id = p_session_id
            AND mapping.traditional_jid = p_jid
        ))
        -- 如果 p_jid 是 LID，查找对应的传统 JID
        OR (p_jid LIKE '%@lid' AND m.remote_jid IN (
            SELECT mapping.traditional_jid FROM whatsapp_jid_mapping mapping
            WHERE mapping.session_id = p_session_id
            AND mapping.lid_jid = p_jid
        ))
    )
    ORDER BY m.message_id, m.message_timestamp ASC;
END;
$$ LANGUAGE plpgsql;

-- 6. 验证
SELECT 
    'Function created' as status,
    COUNT(*) as mapping_count
FROM whatsapp_jid_mapping;

-- 7. 测试函数
SELECT COUNT(*) as message_count
FROM get_merged_messages('sess_9ai6rbwfe_1770361159106', '85291969997@s.whatsapp.net');
