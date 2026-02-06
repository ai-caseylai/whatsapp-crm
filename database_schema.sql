-- WhatsApp CRM 数据库表结构
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 会话表
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    session_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'stopped',
    qr_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 联系人表（包括群组）
CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    jid TEXT NOT NULL,
    name TEXT,
    notify TEXT,
    is_group BOOLEAN DEFAULT FALSE,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, jid)
);

-- 为联系人表创建索引
CREATE INDEX IF NOT EXISTS idx_contacts_session_id ON whatsapp_contacts(session_id);
CREATE INDEX IF NOT EXISTS idx_contacts_jid ON whatsapp_contacts(jid);
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON whatsapp_contacts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_is_group ON whatsapp_contacts(is_group);

-- 3. 消息表
CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id BIGSERIAL PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    remote_jid TEXT NOT NULL,
    from_me BOOLEAN DEFAULT FALSE,
    participant TEXT,  -- 群组消息发送者 JID
    participant_phone TEXT,  -- 群组消息发送者电话
    message_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    push_name TEXT,
    message_type TEXT,
    content TEXT,
    attachment_path TEXT,
    full_message_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, message_id)
);

-- 为消息表创建索引
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON whatsapp_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_remote_jid ON whatsapp_messages(remote_jid);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON whatsapp_messages(message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_from_me ON whatsapp_messages(from_me);
CREATE INDEX IF NOT EXISTS idx_messages_session_remote ON whatsapp_messages(session_id, remote_jid, message_timestamp DESC);

-- 如果需要添加缺失的字段（在已有表上运行）
-- 检查并添加 participant 字段
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_messages' AND column_name = 'participant'
    ) THEN
        ALTER TABLE whatsapp_messages ADD COLUMN participant TEXT;
    END IF;
END $$;

-- 检查并添加 participant_phone 字段
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_messages' AND column_name = 'participant_phone'
    ) THEN
        ALTER TABLE whatsapp_messages ADD COLUMN participant_phone TEXT;
    END IF;
END $$;

-- 检查并添加 is_group 字段到联系人表
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_contacts' AND column_name = 'is_group'
    ) THEN
        ALTER TABLE whatsapp_contacts ADD COLUMN is_group BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 检查并添加 updated_at 字段到消息表
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'whatsapp_messages' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE whatsapp_messages ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- 启用行级安全（可选，建议生产环境启用）
-- ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- 创建自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为会话表创建触发器
DROP TRIGGER IF EXISTS update_whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER update_whatsapp_sessions_updated_at 
    BEFORE UPDATE ON whatsapp_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 为联系人表创建触发器
DROP TRIGGER IF EXISTS update_whatsapp_contacts_updated_at ON whatsapp_contacts;
CREATE TRIGGER update_whatsapp_contacts_updated_at 
    BEFORE UPDATE ON whatsapp_contacts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 为消息表创建触发器
DROP TRIGGER IF EXISTS update_whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER update_whatsapp_messages_updated_at 
    BEFORE UPDATE ON whatsapp_messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 查询语句示例

-- 查看所有会话
-- SELECT * FROM whatsapp_sessions ORDER BY updated_at DESC;

-- 查看某个会话的所有联系人
-- SELECT * FROM whatsapp_contacts 
-- WHERE session_id = 'YOUR_SESSION_ID' 
-- ORDER BY updated_at DESC;

-- 查看所有群组
-- SELECT * FROM whatsapp_contacts 
-- WHERE session_id = 'YOUR_SESSION_ID' 
-- AND is_group = TRUE 
-- ORDER BY updated_at DESC;

-- 查看某个会话的最新消息
-- SELECT 
--     m.message_id,
--     m.remote_jid,
--     c.name as chat_name,
--     m.participant,
--     m.participant_phone,
--     m.push_name,
--     m.content,
--     m.message_timestamp
-- FROM whatsapp_messages m
-- LEFT JOIN whatsapp_contacts c ON m.remote_jid = c.jid AND m.session_id = c.session_id
-- WHERE m.session_id = 'YOUR_SESSION_ID'
-- ORDER BY m.message_timestamp DESC
-- LIMIT 20;

-- 查看某个群组的消息（带发送者信息）
-- SELECT 
--     m.message_id,
--     m.push_name as sender_name,
--     m.participant_phone,
--     m.content,
--     m.message_timestamp,
--     m.from_me
-- FROM whatsapp_messages m
-- WHERE m.session_id = 'YOUR_SESSION_ID'
-- AND m.remote_jid = 'GROUP_JID@g.us'
-- ORDER BY m.message_timestamp DESC
-- LIMIT 50;

-- 统计某个会话的消息数量
-- SELECT 
--     remote_jid,
--     c.name,
--     c.is_group,
--     COUNT(*) as message_count,
--     MAX(message_timestamp) as last_message
-- FROM whatsapp_messages m
-- LEFT JOIN whatsapp_contacts c ON m.remote_jid = c.jid AND m.session_id = c.session_id
-- WHERE m.session_id = 'YOUR_SESSION_ID'
-- GROUP BY remote_jid, c.name, c.is_group
-- ORDER BY last_message DESC;

-- 查看今天发送的消息数量
-- SELECT COUNT(*) as sent_today 
-- FROM whatsapp_messages 
-- WHERE session_id = 'YOUR_SESSION_ID'
-- AND from_me = TRUE
-- AND message_timestamp >= CURRENT_DATE;
