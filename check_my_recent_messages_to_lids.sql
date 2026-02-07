-- 查看您最近给前5个 LID 发送的消息
-- 这样更容易识别他们是谁

-- 1. 178099509579845@lid (115 条消息)
SELECT 
    '1. 178099509579845@lid (115条)' as lid_info,
    message_timestamp,
    LEFT(content, 100) as your_message
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '178099509579845@lid'
    AND from_me = TRUE
ORDER BY message_timestamp DESC
LIMIT 3;

-- 2. 34585324838995@lid (28 条消息)
SELECT 
    '2. 34585324838995@lid (28条)' as lid_info,
    message_timestamp,
    LEFT(content, 100) as your_message
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '34585324838995@lid'
    AND from_me = TRUE
ORDER BY message_timestamp DESC
LIMIT 3;

-- 3. 103448683004140@lid (19 条消息)
SELECT 
    '3. 103448683004140@lid (19条)' as lid_info,
    message_timestamp,
    LEFT(content, 100) as your_message
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '103448683004140@lid'
    AND from_me = TRUE
ORDER BY message_timestamp DESC
LIMIT 3;

-- 4. 164622002872407@lid (16 条消息)
SELECT 
    '4. 164622002872407@lid (16条)' as lid_info,
    message_timestamp,
    LEFT(content, 100) as your_message
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '164622002872407@lid'
    AND from_me = TRUE
ORDER BY message_timestamp DESC
LIMIT 3;

-- 5. 264879776780371@lid (16 条消息)
SELECT 
    '5. 264879776780371@lid (16条)' as lid_info,
    message_timestamp,
    LEFT(content, 100) as your_message
FROM whatsapp_messages
WHERE session_id = 'sess_9ai6rbwfe_1770361159106'
    AND remote_jid = '264879776780371@lid'
    AND from_me = TRUE
ORDER BY message_timestamp DESC
LIMIT 3;
