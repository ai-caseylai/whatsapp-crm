-- 修复 LID 和传统 JID 映射问题
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 创建 JID 映射表
CREATE TABLE IF NOT EXISTS whatsapp_jid_mapping (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    lid_jid TEXT NOT NULL,           -- LID 格式的 JID (例如: 69827679002840@lid)
    traditional_jid TEXT NOT NULL,    -- 传统格式的 JID (例如: 85291969997@s.whatsapp.net)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 确保每个 session 下的 LID 只映射到一个传统 JID
    UNIQUE(session_id, lid_jid),
    
    -- 确保每个 session 下的传统 JID 只映射到一个 LID
    UNIQUE(session_id, traditional_jid)
);

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_jid_mapping_session_lid ON whatsapp_jid_mapping(session_id, lid_jid);
CREATE INDEX IF NOT EXISTS idx_jid_mapping_session_trad ON whatsapp_jid_mapping(session_id, traditional_jid);

-- 3. 添加触发器自动更新 updated_at
DROP TRIGGER IF EXISTS update_whatsapp_jid_mapping_updated_at ON whatsapp_jid_mapping;
CREATE TRIGGER update_whatsapp_jid_mapping_updated_at 
    BEFORE UPDATE ON whatsapp_jid_mapping 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 3.5. 确保 whatsapp_contacts 表有 last_message_time 列
ALTER TABLE whatsapp_contacts 
ADD COLUMN IF NOT EXISTS last_message_time TIMESTAMP WITH TIME ZONE;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_contacts_last_message_time ON whatsapp_contacts(last_message_time DESC);

-- 4. 手动添加已知的映射关系（Casey 和 黃sir沈香林）
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '69827679002840@lid', '85291969997@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 5. 创建一个函数来获取合并后的消息列表
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
    media_path TEXT,
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
        m.media_path,
        m.full_message_json,
        m.created_at,
        m.updated_at
    FROM whatsapp_messages m
    WHERE m.session_id = p_session_id
    AND (
        m.remote_jid = p_jid
        OR m.remote_jid IN (
            SELECT mapping.lid_jid FROM whatsapp_jid_mapping mapping
            WHERE mapping.session_id = p_session_id
            AND mapping.traditional_jid = p_jid
        )
        OR m.remote_jid IN (
            SELECT mapping.traditional_jid FROM whatsapp_jid_mapping mapping
            WHERE mapping.session_id = p_session_id
            AND mapping.lid_jid = p_jid
        )
    )
    ORDER BY m.message_id, m.message_timestamp ASC;
END;
$$ LANGUAGE plpgsql;

-- 6. 创建一个视图来显示合并后的联系人列表
CREATE OR REPLACE VIEW whatsapp_contacts_merged AS
SELECT DISTINCT ON (
    c.session_id,
    COALESCE(
        (SELECT mapping.traditional_jid 
         FROM whatsapp_jid_mapping mapping 
         WHERE mapping.session_id = c.session_id 
         AND mapping.lid_jid = c.jid),
        c.jid
    )
)
    c.session_id,
    -- 优先使用传统 JID
    COALESCE(
        (SELECT mapping.traditional_jid 
         FROM whatsapp_jid_mapping mapping 
         WHERE mapping.session_id = c.session_id 
         AND mapping.lid_jid = c.jid),
        c.jid
    ) as jid,
    -- 优先使用传统 JID 的名字
    COALESCE(
        (SELECT c2.name 
         FROM whatsapp_contacts c2
         JOIN whatsapp_jid_mapping mapping ON c2.jid = mapping.traditional_jid
         WHERE mapping.session_id = c.session_id 
         AND mapping.lid_jid = c.jid
         AND c2.name IS NOT NULL
         AND c2.name != ''
         LIMIT 1),
        c.name
    ) as name,
    c.notify,
    c.is_group,
    c.created_at,
    GREATEST(
        c.updated_at,
        COALESCE((SELECT c2.updated_at 
                  FROM whatsapp_contacts c2
                  JOIN whatsapp_jid_mapping mapping ON c2.jid = mapping.traditional_jid
                  WHERE mapping.session_id = c.session_id 
                  AND mapping.lid_jid = c.jid
                  LIMIT 1), c.updated_at)
    ) as updated_at,
    c.custom_name,
    -- 合并两个 JID 的最后消息时间（从消息表中直接计算，支持 LID 和传统 JID）
    (SELECT MAX(m.message_timestamp)
     FROM whatsapp_messages m
     WHERE m.session_id = c.session_id
     AND (
         m.remote_jid = c.jid
         OR m.remote_jid IN (
             SELECT mapping.lid_jid FROM whatsapp_jid_mapping mapping
             WHERE mapping.session_id = c.session_id
             AND mapping.traditional_jid = c.jid
         )
         OR m.remote_jid IN (
             SELECT mapping.traditional_jid FROM whatsapp_jid_mapping mapping
             WHERE mapping.session_id = c.session_id
             AND mapping.lid_jid = c.jid
         )
     )
    ) as last_message_time,
    c.phone
FROM whatsapp_contacts c
-- 排除那些已经有 LID 映射的传统 JID（避免重复显示）
WHERE NOT EXISTS (
    SELECT 1 FROM whatsapp_jid_mapping mapping
    WHERE mapping.session_id = c.session_id
    AND mapping.traditional_jid = c.jid
    AND c.jid LIKE '%@s.whatsapp.net'
    AND EXISTS (
        SELECT 1 FROM whatsapp_contacts c_lid
        WHERE c_lid.session_id = c.session_id
        AND c_lid.jid = mapping.lid_jid
    )
);

-- 7. 验证创建结果
SELECT 
    'whatsapp_jid_mapping table created' as status,
    COUNT(*) as mapping_count
FROM whatsapp_jid_mapping;

SELECT 
    'Merged view test' as status,
    COUNT(*) as contact_count
FROM whatsapp_contacts_merged
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';
