-- 彻底清理失效的会话 sess_9ai6rbwfe_1770361159106
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 删除会话记录
DELETE FROM whatsapp_sessions 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';

-- 2. 删除联系人数据
DELETE FROM whatsapp_contacts 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';

-- 3. 可选：删除消息数据（注释掉以保留历史）
-- DELETE FROM whatsapp_messages 
-- WHERE session_id = 'sess_9ai6rbwfe_1770361159106';

-- 4. 确认清理结果
SELECT 'Sessions' AS table_name, COUNT(*) AS remaining_records 
FROM whatsapp_sessions 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
UNION ALL
SELECT 'Contacts' AS table_name, COUNT(*) AS remaining_records 
FROM whatsapp_contacts 
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';
