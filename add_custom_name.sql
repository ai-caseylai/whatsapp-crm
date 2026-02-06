-- 在 whatsapp_contacts 表中添加 custom_name 字段用于用户自定义备注

-- 添加 custom_name 列
ALTER TABLE whatsapp_contacts 
ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_contacts_custom_name 
ON whatsapp_contacts(session_id, custom_name) 
WHERE custom_name IS NOT NULL;

-- 添加注释
COMMENT ON COLUMN whatsapp_contacts.custom_name IS '用户自定义的联系人备注名称';
