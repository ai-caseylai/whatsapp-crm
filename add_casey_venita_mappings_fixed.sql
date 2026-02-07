-- 添加 Casey (自己) 和 Venita 的 LID 映射（修复版）

-- 先查看现有映射
SELECT 
    '现有映射' as info,
    lid_jid, 
    traditional_jid
FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
ORDER BY created_at;

-- 1. 尝试添加 Casey 的映射（如果已存在则跳过）
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '113258304381036@lid', '85297188675@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING
ON CONFLICT (session_id, traditional_jid) DO UPDATE 
    SET lid_jid = EXCLUDED.lid_jid;

-- 2. 尝试添加另一个 Note to Self 的 LID（如果已存在则跳过）
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '210719786180760@lid', '85297188675@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING
ON CONFLICT (session_id, traditional_jid) DO NOTHING;

-- 3. 添加 venita 的映射
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '68629316030618@lid', '85261338816@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 4. 更新 venita 的名字（如果传统 JID 存在）
UPDATE whatsapp_contacts
SET name = 'venita',
    updated_at = NOW()
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
AND jid = '85261338816@s.whatsapp.net';

-- 5. 查看所有映射
SELECT 
    '更新后的映射' as info,
    lid_jid, 
    traditional_jid,
    created_at
FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
ORDER BY created_at;

-- 6. 测试合并函数（venita）
SELECT 
    'venita 消息统计' as test,
    COUNT(*) as message_count
FROM get_merged_messages('sess_9ai6rbwfe_1770361159106', '85261338816@s.whatsapp.net');

-- 7. 检查还有哪些 LID 需要映射
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
