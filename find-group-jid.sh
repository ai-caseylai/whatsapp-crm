#!/bin/bash
# 快速查找群组 JID 的脚本

echo "=========================================="
echo "  WhatsApp 群组 JID 查找工具"
echo "=========================================="
echo ""

# 检查是否安装了 node
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "📋 正在查询 Supabase 数据库中的群组列表..."
echo ""

# 创建临时的 Node.js 脚本
cat > /tmp/find_groups.js << 'EOF'
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function findGroups() {
    const { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('session_id, jid, name, updated_at')
        .like('jid', '%@g.us')
        .order('updated_at', { ascending: false })
        .limit(50);
    
    if (error) {
        console.error('❌ 查询失败:', error.message);
        return;
    }
    
    if (!data || data.length === 0) {
        console.log('❌ 未找到任何群组');
        return;
    }
    
    console.log(`✅ 找到 ${data.length} 个群组:\n`);
    console.log('序号 | 群组名称 | 群组 JID | 会话ID | 最后更新');
    console.log('-----|----------|----------|--------|----------');
    
    data.forEach((group, index) => {
        const name = group.name || '(未命名)';
        const jid = group.jid;
        const sessionId = group.session_id;
        const updatedAt = new Date(group.updated_at).toLocaleString('zh-CN');
        
        console.log(`${index + 1}. ${name}`);
        console.log(`   JID: ${jid}`);
        console.log(`   会话: ${sessionId}`);
        console.log(`   更新: ${updatedAt}`);
        console.log('');
    });
    
    console.log('\n📝 配置步骤:');
    console.log('1. 找到 "Casey 与 Casey 的对话群组" 对应的 JID');
    console.log('2. 复制完整的 JID (包括 @g.us)');
    console.log('3. 编辑 server.js，找到 ALLOWED_WEBHOOK_GROUPS');
    console.log('4. 将 JID 添加到数组中');
    console.log('\n示例:');
    console.log('const ALLOWED_WEBHOOK_GROUPS = [');
    console.log('    \'120363XXXXXXXXXX@g.us\',  // Casey 与 Casey 的对话群组');
    console.log('];');
}

findGroups().catch(console.error);
EOF

# 运行脚本
node /tmp/find_groups.js

# 清理
rm /tmp/find_groups.js

echo ""
echo "=========================================="
echo "  完成！"
echo "=========================================="
