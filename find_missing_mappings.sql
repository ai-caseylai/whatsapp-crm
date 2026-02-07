-- 查找需要建立 LID 映射的联系人

-- 方法1: 检查是否有同名的传统 JID 和 LID
SELECT 
    'Casey (需要映射)' as issue,
    c1.jid as lid_jid,
    c1.name as lid_name,
    c2.jid as traditional_jid,
    c2.name as traditional_name
FROM whatsapp_contacts c1
LEFT JOIN whatsapp_contacts c2 
    ON c1.name = c2.name 
    AND c1.session_id = c2.session_id
    AND c2.jid LIKE '%@s.whatsapp.net'
WHERE c1.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c1.jid = '113258304381036@lid';

SELECT 
    'venita (需要映射)' as issue,
    c1.jid as lid_jid,
    c1.name as lid_name,
    c2.jid as traditional_jid,
    c2.name as traditional_name
FROM whatsapp_contacts c1
LEFT JOIN whatsapp_contacts c2 
    ON LOWER(c1.name) = LOWER(c2.name)
    AND c1.session_id = c2.session_id
    AND c2.jid LIKE '%@s.whatsapp.net'
WHERE c1.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c1.jid = '68629316030618@lid';

-- 方法2: 通过消息内容查找
-- 查找 Casey 在哪些群组中出现
SELECT 
    'Casey 在群组中的活动' as info,
    m.participant_phone,
    m.push_name,
    COUNT(*) as message_count
FROM whatsapp_messages m
WHERE m.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND m.push_name ILIKE '%casey%'
GROUP BY m.participant_phone, m.push_name
ORDER BY message_count DESC
LIMIT 10;

-- 查找 venita 在群组中的活动
SELECT 
    'venita 在群组中的活动' as info,
    m.participant_phone,
    m.push_name,
    COUNT(*) as message_count
FROM whatsapp_messages m
WHERE m.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND m.push_name ILIKE '%venita%'
GROUP BY m.participant_phone, m.push_name
ORDER BY message_count DESC
LIMIT 10;

-- 查找所有需要映射的 LID（有 from_me 消息但没有映射）
SELECT 
    c.jid,
    c.name,
    COUNT(m.message_id) as total_messages,
    SUM(CASE WHEN m.from_me THEN 1 ELSE 0 END) as my_messages
FROM whatsapp_contacts c
JOIN whatsapp_messages m ON m.remote_jid = c.jid AND m.session_id = c.session_id
WHERE c.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c.jid LIKE '%@lid'
    AND NOT EXISTS (
        SELECT 1 FROM whatsapp_jid_mapping map
        WHERE map.session_id = c.session_id
        AND map.lid_jid = c.jid
    )
GROUP BY c.jid, c.name
HAVING SUM(CASE WHEN m.from_me THEN 1 ELSE 0 END) > 0
ORDER BY my_messages DESC;
