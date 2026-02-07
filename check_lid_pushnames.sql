-- 检查需要映射的 LID 是否有 pushName

SELECT 
    c.jid as lid_jid,
    c.name as contact_name,
    COUNT(DISTINCT m.push_name) as unique_pushnames,
    STRING_AGG(DISTINCT m.push_name, ', ') as all_pushnames,
    COUNT(m.message_id) as total_messages,
    SUM(CASE WHEN m.from_me THEN 1 ELSE 0 END) as my_messages
FROM whatsapp_contacts c
JOIN whatsapp_messages m ON m.remote_jid = c.jid AND m.session_id = c.session_id
WHERE c.session_id = 'sess_9ai6rbwfe_1770361159106'
    AND c.jid LIKE '%@lid'
    AND NOT EXISTS (
        SELECT 1 FROM whatsapp_jid_mapping map
        WHERE map.session_id = c.session_id AND map.lid_jid = c.jid
    )
    AND EXISTS (
        SELECT 1 FROM whatsapp_messages m2
        WHERE m2.session_id = c.session_id 
        AND m2.remote_jid = c.jid
        AND m2.from_me = TRUE
    )
GROUP BY c.jid, c.name
ORDER BY my_messages DESC
LIMIT 10;
