-- 清理空的数字联系人（没有消息记录的 LID 联系人）

-- 1. 统计需要清理的联系人
SELECT 
    '待清理统计' as status,
    COUNT(*) as total_empty_contacts
FROM whatsapp_contacts c
WHERE c.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c.jid LIKE '%@lid'
    AND c.name IS NULL
    AND c.is_group = FALSE
    AND NOT EXISTS (
        SELECT 1 FROM whatsapp_messages m
        WHERE m.session_id = c.session_id
        AND m.remote_jid = c.jid
    );

-- 2. 查看前10个将被删除的联系人
SELECT 
    '将被删除的联系人示例' as status,
    c.jid,
    c.created_at
FROM whatsapp_contacts c
WHERE c.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c.jid LIKE '%@lid'
    AND c.name IS NULL
    AND c.is_group = FALSE
    AND NOT EXISTS (
        SELECT 1 FROM whatsapp_messages m
        WHERE m.session_id = c.session_id
        AND m.remote_jid = c.jid
    )
LIMIT 10;

-- 3. 删除空的 LID 联系人（没有消息记录）
DELETE FROM whatsapp_contacts
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND jid LIKE '%@lid'
    AND name IS NULL
    AND is_group = FALSE
    AND NOT EXISTS (
        SELECT 1 FROM whatsapp_messages m
        WHERE m.session_id = session_id
        AND m.remote_jid = jid
    );

-- 4. 验证清理结果
SELECT 
    '清理后统计' as status,
    COUNT(*) as remaining_no_name_contacts
FROM whatsapp_contacts
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND name IS NULL
    AND is_group = FALSE;

-- 5. 查看保留的没有名字但有消息的联系人（这些是需要映射的）
SELECT 
    '保留的联系人（有消息）' as status,
    c.jid,
    COUNT(m.message_id) as message_count
FROM whatsapp_contacts c
JOIN whatsapp_messages m ON m.remote_jid = c.jid AND m.session_id = c.session_id
WHERE c.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c.jid LIKE '%@lid'
    AND c.name IS NULL
    AND c.is_group = FALSE
GROUP BY c.jid
LIMIT 10;
