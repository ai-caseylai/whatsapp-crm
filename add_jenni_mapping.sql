-- 添加 Jenni Chui 的 LID 映射
-- Casey (85292490182) 实际上是 Jenni 的传统 JID

-- 1. 添加映射关系
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '236287743242309@lid', '85292490182@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 2. 更新传统 JID 的名字为 Jenni
UPDATE whatsapp_contacts
SET name = 'Jenni Chui',
    updated_at = NOW()
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
AND jid = '85292490182@s.whatsapp.net';

-- 3. 验证
SELECT 
    'Mapping added' as status,
    COUNT(*) as total_mappings
FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';

-- 4. 测试合并函数
SELECT COUNT(*) as jenni_message_count
FROM get_merged_messages('sess_9ai6rbwfe_1770361159106', '85292490182@s.whatsapp.net');
