-- 为 Casey (175196162015262@lid) 建立映射
-- 通过群组消息查找 Casey 的传统 JID

-- 1. 在群组中查找 Casey 的电话号码
SELECT 
    'Casey 在群组中的电话' as info,
    push_name,
    participant_phone,
    COUNT(*) as appearances
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid LIKE '%@g.us'
    AND LOWER(push_name) = 'casey'
    AND participant_phone IS NOT NULL
GROUP BY push_name, participant_phone
ORDER BY appearances DESC;

-- 2. 查看 Casey (LID) 的最近对话
SELECT 
    'Casey LID 最近对话' as info,
    message_timestamp,
    from_me,
    LEFT(content, 80) as content
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '175196162015262@lid'
ORDER BY message_timestamp DESC
LIMIT 5;
