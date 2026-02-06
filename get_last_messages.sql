-- 创建 Supabase 函数来高效获取每个联系人的最后消息时间
-- 在 Supabase SQL Editor 中执行此脚本

-- 创建函数获取每个联系人的最后消息时间
-- 🔧 只统计真实的聊天消息，排除系统消息（和 WhatsApp 显示逻辑一致）
CREATE OR REPLACE FUNCTION get_last_message_times(session_id_param TEXT)
RETURNS TABLE (
    remote_jid TEXT,
    last_message_timestamp TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.remote_jid,
        MAX(m.message_timestamp) as last_message_timestamp
    FROM whatsapp_messages m
    WHERE m.session_id = session_id_param
      AND m.message_type NOT IN (
        'protocolMessage',      -- 系统协议消息
        'reactionMessage',       -- 表情反应
        'pollUpdateMessage',     -- 投票更新
        'senderKeyDistributionMessage',  -- 加密密钥分发
        'messageContextInfo'     -- 消息上下文信息
      )
      AND m.message_content IS NOT NULL  -- 排除空消息
      AND m.message_content != ''         -- 排除空字符串消息
    GROUP BY m.remote_jid;
END;
$$ LANGUAGE plpgsql;

-- 测试函数
-- SELECT * FROM get_last_message_times('YOUR_SESSION_ID');

-- 如果需要删除函数，使用：
-- DROP FUNCTION IF EXISTS get_last_message_times(TEXT);
