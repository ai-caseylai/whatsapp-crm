-- 识别最需要映射的 LID（通过查看对话内容和 pushName）

-- 1. 最重要的 LID: 178099509579845@lid (115 条您的消息)
SELECT 
    '1. 178099509579845@lid' as lid,
    push_name,
    COUNT(*) as message_count
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '178099509579845@lid'
    AND push_name IS NOT NULL
    AND from_me = FALSE
GROUP BY push_name;

-- 查看对方的最新3条消息
SELECT 
    '最新对话' as info,
    message_timestamp,
    push_name,
    LEFT(content, 100) as content_preview
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '178099509579845@lid'
ORDER BY message_timestamp DESC
LIMIT 5;

-- 2. 第二重要的 LID: 34585324838995@lid (28 条您的消息)
SELECT 
    '2. 34585324838995@lid' as lid,
    push_name,
    COUNT(*) as message_count
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '34585324838995@lid'
    AND push_name IS NOT NULL
    AND from_me = FALSE
GROUP BY push_name;

-- 3. 第三重要的 LID: 103448683004140@lid (19 条您的消息)
SELECT 
    '3. 103448683004140@lid' as lid,
    push_name,
    COUNT(*) as message_count
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '103448683004140@lid'
    AND push_name IS NOT NULL
    AND from_me = FALSE
GROUP BY push_name;

-- 4. 通过群组消息查找这些 pushName 的电话号码
-- 假设我们从上面的查询中得到了 pushName
-- 例如，如果第一个 LID 的 pushName 是 "某某某"，我们可以这样查：
SELECT 
    '查找 pushName 的电话号码' as info,
    push_name,
    participant_phone,
    COUNT(*) as appearances_in_groups
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid LIKE '%@g.us'
    AND participant_phone IS NOT NULL
    AND push_name IN (
        -- 从前3个查询中获取的 pushName
        SELECT DISTINCT push_name
        FROM whatsapp_messages
        WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
        AND remote_jid IN ('178099509579845@lid', '34585324838995@lid', '103448683004140@lid')
        AND push_name IS NOT NULL
        AND from_me = FALSE
    )
GROUP BY push_name, participant_phone
ORDER BY appearances_in_groups DESC;
