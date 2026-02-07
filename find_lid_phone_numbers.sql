-- 通过群组消息查找 LID 对应的电话号码
-- 策略：当这些人在群组中发消息时，会记录他们的 participant_phone

-- 创建临时视图：需要映射的 LID 列表
WITH lid_to_map AS (
    SELECT 
        c.jid as lid_jid,
        c.name as lid_name,
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
)
-- 查找这些 LID 在群组中的活动，获取他们的电话号码
SELECT 
    ltm.lid_jid,
    ltm.lid_name,
    ltm.my_messages,
    m.participant_phone,
    m.push_name,
    COUNT(*) as group_message_count,
    MAX(m.message_timestamp) as last_group_message
FROM lid_to_map ltm
JOIN whatsapp_messages m 
    ON m.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND m.remote_jid LIKE '%@g.us'  -- 群组消息
    AND m.participant_phone IS NOT NULL
WHERE EXISTS (
    -- 确保这个 participant 和 LID 有过直接对话
    SELECT 1 FROM whatsapp_messages m2
    WHERE m2.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND m2.remote_jid = ltm.lid_jid
    AND m2.push_name = m.push_name
)
GROUP BY ltm.lid_jid, ltm.lid_name, ltm.my_messages, m.participant_phone, m.push_name
ORDER BY ltm.my_messages DESC, group_message_count DESC;
