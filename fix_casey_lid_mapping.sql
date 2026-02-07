-- 修正 Casey (175196162015262@lid) 的映射
-- 删除错误格式的映射并添加正确的

-- 1. 查看当前映射
SELECT '修正前' as status, * FROM whatsapp_jid_mapping 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106' 
AND lid_jid = '175196162015262@lid';

-- 2. 删除错误的映射
DELETE FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
AND lid_jid = '175196162015262@lid';

-- 3. 添加正确的映射
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
VALUES ('sess_9ai6rbwfe_1770361159106', '175196162015262@lid', '85253772183@s.whatsapp.net')
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 4. 验证修正结果
SELECT '修正后' as status, * FROM whatsapp_jid_mapping 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106' 
AND lid_jid = '175196162015262@lid';

-- 5. 测试合并功能
SELECT 
    'Casey 消息统计' as test,
    COUNT(*) as message_count
FROM get_merged_messages('sess_9ai6rbwfe_1770361159106', '85253772183@s.whatsapp.net');

-- 6. 检查是否还有其他错误格式的映射
SELECT 
    '错误格式的映射' as status,
    lid_jid,
    traditional_jid
FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
AND (
    traditional_jid LIKE '%+%' 
    OR traditional_jid LIKE '% %'
);
