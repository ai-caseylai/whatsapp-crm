const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getGroupName() {
    const jid = '120363406687498894@g.us';
    
    console.log(`🔍 查詢群組: ${jid}\n`);
    
    // 方法 1: 從 whatsapp_contacts 查詢
    const { data: contact, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('jid', jid)
        .single();
    
    if (contact) {
        console.log('✅ 從聯絡人表找到:');
        console.log(`   群組名稱: ${contact.name || contact.notify || '(無名稱)'}`);
        console.log(`   JID: ${contact.jid}`);
        console.log(`   是否群組: ${contact.is_group ? '是' : '否'}`);
        console.log(`   更新時間: ${new Date(contact.updated_at).toLocaleString('zh-TW')}`);
        return;
    }
    
    // 方法 2: 從消息中查找 push_name
    console.log('⚠️  聯絡人表中沒有找到，從消息記錄查詢...\n');
    
    const { data: messages, error: msgError } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid, push_name, content, message_timestamp')
        .eq('remote_jid', jid)
        .not('push_name', 'is', null)
        .order('message_timestamp', { ascending: false })
        .limit(10);
    
    if (messages && messages.length > 0) {
        console.log('✅ 從消息記錄找到:');
        
        // 提取所有不同的名稱
        const names = [...new Set(messages.map(m => m.push_name).filter(n => n))];
        
        console.log(`   可能的群組名稱: ${names[0]}`);
        console.log(`   JID: ${jid}`);
        console.log(`   消息數量: ${messages.length}`);
        console.log(`   最近消息時間: ${new Date(messages[0].message_timestamp).toLocaleString('zh-TW')}`);
        
        console.log('\n   最近幾條消息:');
        messages.slice(0, 3).forEach((msg, i) => {
            const time = new Date(msg.message_timestamp).toLocaleString('zh-TW');
            const content = msg.content ? msg.content.substring(0, 50) : '[非文字消息]';
            console.log(`   ${i + 1}. [${time}] ${content}...`);
        });
    } else {
        console.log('❌ 在消息記錄中也沒有找到');
    }
}

getGroupName().catch(console.error);
