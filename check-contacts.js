const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkContacts() {
    console.log('🔍 檢查聯絡人和消息資料...\n');
    
    // 1. 檢查聯絡人總數
    const { count: totalContacts } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true });
    console.log('📊 聯絡人總數:', totalContacts);
    
    // 2. 檢查消息總數
    const { count: totalMessages } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true });
    console.log('📊 消息總數:', totalMessages);
    
    // 3. 檢查不同的 session_id
    const { data: contactSessions } = await supabase
        .from('whatsapp_contacts')
        .select('session_id')
        .limit(5);
    console.log('\n📱 聯絡人表中的 session_id (前5個):');
    contactSessions?.forEach((s, i) => console.log(`   ${i + 1}. ${s.session_id}`));
    
    const { data: messageSessions } = await supabase
        .from('whatsapp_messages')
        .select('session_id')
        .limit(5);
    console.log('\n💬 消息表中的 session_id (前5個):');
    messageSessions?.forEach((s, i) => console.log(`   ${i + 1}. ${s.session_id}`));
    
    // 4. 檢查特定 session
    const SESSION_ID = 'sess_id73sa6oi_1770363274857';
    console.log(`\n🎯 檢查 session: ${SESSION_ID}`);
    
    const { count: sessionContacts } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID);
    console.log(`   聯絡人數: ${sessionContacts}`);
    
    const { count: sessionMessages } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID);
    console.log(`   消息數: ${sessionMessages}`);
    
    // 5. 如果聯絡人為 0，檢查消息中有哪些 remote_jid
    if (sessionContacts === 0 && sessionMessages > 0) {
        console.log('\n⚠️  發現問題：有消息但沒有聯絡人！');
        console.log('📋 消息中的聯絡人列表（remote_jid）：');
        
        const { data: jids } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid')
            .eq('session_id', SESSION_ID)
            .limit(1000);
        
        const uniqueJids = [...new Set(jids?.map(j => j.remote_jid) || [])];
        console.log(`   找到 ${uniqueJids.length} 個唯一的聯絡人`);
        uniqueJids.slice(0, 10).forEach((jid, i) => {
            console.log(`   ${i + 1}. ${jid}`);
        });
    }
}

checkContacts().catch(console.error);
