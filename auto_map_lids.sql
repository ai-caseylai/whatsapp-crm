-- 自动关联 LID 到传统 JID
-- 策略：通过群组消息中的 participant_phone 和消息时间戳匹配

-- 第一步：找出所有需要映射的 LID 及其最近的消息
WITH lid_needs_mapping AS (
    SELECT DISTINCT
        c.jid as lid_jid,
        c.name as lid_name,
        m.push_name,
        m.message_timestamp,
        m.content
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
),
-- 第二步：在群组消息中查找这些 pushName 对应的电话号码
group_participants AS (
    SELECT DISTINCT
        gm.push_name,
        gm.participant_phone,
        COUNT(*) as appearances
    FROM whatsapp_messages gm
    WHERE gm.session_id = 'sess_9ai6rbwfe_1770361159106'
        AND gm.remote_jid LIKE '%@g.us'
        AND gm.participant_phone IS NOT NULL
        AND gm.push_name IS NOT NULL
    GROUP BY gm.push_name, gm.participant_phone
),
-- 第三步：匹配 LID 和传统 JID
matched_pairs AS (
    SELECT DISTINCT
        lnm.lid_jid,
        lnm.lid_name,
        lnm.push_name,
        gp.participant_phone as traditional_jid,
        gp.appearances as confidence
    FROM lid_needs_mapping lnm
    JOIN group_participants gp 
        ON LOWER(TRIM(lnm.push_name)) = LOWER(TRIM(gp.push_name))
    WHERE gp.participant_phone LIKE '%@s.whatsapp.net'
)
-- 显示找到的匹配
SELECT 
    '自动匹配结果' as info,
    lid_jid,
    push_name,
    traditional_jid,
    confidence as group_appearances
FROM matched_pairs
ORDER BY confidence DESC;

-- 如果上面的查询返回结果，执行下面的 INSERT 来自动添加映射
-- （先查看结果确认无误后再执行）

/*
-- 自动插入映射（确认上面的结果正确后，取消注释执行）
INSERT INTO whatsapp_jid_mapping (session_id, lid_jid, traditional_jid)
SELECT 
    'sess_9ai6rbwfe_1770361159106',
    lid_jid,
    traditional_jid
FROM (
    WITH lid_needs_mapping AS (
        SELECT DISTINCT
            c.jid as lid_jid,
            c.name as lid_name,
            m.push_name,
            m.message_timestamp,
            m.content
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
    ),
    group_participants AS (
        SELECT DISTINCT
            gm.push_name,
            gm.participant_phone,
            COUNT(*) as appearances
        FROM whatsapp_messages gm
        WHERE gm.session_id = 'sess_9ai6rbwfe_1770361159106'
            AND gm.remote_jid LIKE '%@g.us'
            AND gm.participant_phone IS NOT NULL
            AND gm.push_name IS NOT NULL
        GROUP BY gm.push_name, gm.participant_phone
    ),
    matched_pairs AS (
        SELECT DISTINCT
            lnm.lid_jid,
            lnm.lid_name,
            lnm.push_name,
            gp.participant_phone as traditional_jid,
            gp.appearances as confidence
        FROM lid_needs_mapping lnm
        JOIN group_participants gp 
            ON LOWER(TRIM(lnm.push_name)) = LOWER(TRIM(gp.push_name))
        WHERE gp.participant_phone LIKE '%@s.whatsapp.net'
    )
    SELECT lid_jid, traditional_jid
    FROM matched_pairs
    WHERE confidence > 1  -- 只映射在群组中出现过2次以上的
) as mappings
ON CONFLICT (session_id, lid_jid) DO NOTHING;

-- 验证插入结果
SELECT 
    '映射完成' as status,
    COUNT(*) as total_mappings
FROM whatsapp_jid_mapping
WHERE session_id = 'sess_9ai6rbwfe_1770361159106';
*/
