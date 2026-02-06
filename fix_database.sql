-- 紧急修复：添加缺失的 updated_at 字段
-- 请在 Supabase SQL Editor 中执行此脚本

-- 添加 updated_at 字段到 whatsapp_messages 表
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_messages_updated_at ON whatsapp_messages(updated_at DESC);

-- 更新现有记录的 updated_at（使用 created_at 的值）
UPDATE whatsapp_messages 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- 创建自动更新触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为消息表创建触发器
DROP TRIGGER IF EXISTS update_whatsapp_messages_updated_at ON whatsapp_messages;
CREATE TRIGGER update_whatsapp_messages_updated_at 
    BEFORE UPDATE ON whatsapp_messages 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 验证字段是否添加成功
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'whatsapp_messages' 
AND column_name = 'updated_at';
