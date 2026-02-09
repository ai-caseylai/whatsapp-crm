const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkKiasuSailing() {
    console.log('🔍 檢查 "Kiasu L Sailing" 群組...\n');
    
    // 1. 在聯絡人中搜索
    console.log('步驟 1: 在聯絡人表中搜索...');
    const { data: contacts, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .ilike('name', '%Kiasu%');
    
    if (contacts && contacts.length > 0) {
        console.log(`✅ 找到 ${contacts.length} 個匹配的聯絡人:`);
        contacts.forEach(c => {
            console.log(`   - ${c.name || c.notify || '(無名稱)'} (${c.jid})`);
            console.log(`     Session: ${c.session_id}`);
        });
    } else {
        console.log('❌ 聯絡人表中沒有找到\n');
    }
    
    // 2. 在消息中搜索包含 "Kiasu" 的群組
    console.log('\n步驟 2: 在消息表中搜索 "Kiasu"...');
    const { data: messages, error: msgError } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid, push_name, content, session_id')
        .eq('session_id', SESSION_ID)
        .or('push_name.ilike.%Kiasu%,content.ilike.%Kiasu%')
        .limit(20);
    
    if (messages && messages.length > 0) {
        console.log(`✅ 找到 ${messages.length} 條相關消息`);
        
        // 提取唯一的 JID
        const uniqueJids = [...new Set(messages.map(m => m.remote_jid))];
        console.log(`\n   涉及 ${uniqueJids.length} 個聯絡人/群組:`);
        uniqueJids.forEach(jid => {
            const msgWithName = messages.find(m => m.remote_jid === jid && m.push_name);
            const name = msgWithName ? msgWithName.push_name : '(無名稱)';
            const count = messages.filter(m => m.remote_jid === jid).length;
            console.log(`   - ${name} (${jid}) - ${count} 條消息`);
        });
        
        console.log('\n   消息內容示例:');
        messages.slice(0, 3).forEach((msg, i) => {
            const content = msg.content ? msg.content.substring(0, 80) : msg.push_name || '[非文字]';
            console.log(`   ${i + 1}. ${content}...`);
        });
    } else {
        console.log('❌ 消息表中沒有找到\n');
    }
    
    // 3. 檢查當前 session 的所有群組
    console.log('\n步驟 3: 列出當前 session 的所有群組...');
    const { data: allMessages } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid, push_name')
        .eq('session_id', SESSION_ID)
        .like('remote_jid', '%@g.us')
        .limit(1000);
    
    if (allMessages) {
        const groups = new Map();
        allMessages.forEach(msg => {
            if (!groups.has(msg.remote_jid)) {
                groups.set(msg.remote_jid, msg.push_name || msg.remote_jid);
            }
        });
        
        console.log(`\n✅ 當前 session 共有 ${groups.size} 個群組:`);
        let index = 1;
        for (const [jid, name] of groups) {
            console.log(`   ${index}. ${name} (${jid})`);
            index++;
            if (index > 15) {
                console.log(`   ... (還有 ${groups.size - 15} 個群組)`);
                break;
            }
        }
    }
    
    // 4. 檢查 rag_knowledge 中是否有這個群組的數據
    console.log('\n步驟 4: 檢查知識庫中是否包含 Kiasu...');
    const { data: ragDocs, error: ragError } = await supabase
        .from('rag_knowledge')
        .select('id, content, metadata')
        .ilike('content', '%Kiasu%')
        .limit(5);
    
    if (ragDocs && ragDocs.length > 0) {
        console.log(`✅ 知識庫中找到 ${ragDocs.length} 個相關文檔`);
        ragDocs.forEach((doc, i) => {
            console.log(`   ${i + 1}. ${doc.content.substring(0, 100)}...`);
        });
    } else {
        console.log('❌ 知識庫中沒有找到 "Kiasu" 相關內容');
        console.log('   這可能是問題所在！');
    }
}

checkKiasuSailing().catch(console.error);
