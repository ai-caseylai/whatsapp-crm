const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSessionContacts() {
    const SESSION_ID = 'sess_id73sa6oi_1770363274857';
    const KIASU_JID = '85291818993-1386377848@g.us';
    
    console.log('🔍 檢查當前 session 的聯絡人記錄...\n');
    
    // 1. 檢查當前 session 的 Kiasu 群組
    const { data: contact } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('session_id', SESSION_ID)
        .eq('jid', KIASU_JID)
        .single();
    
    if (contact) {
        console.log('✅ 當前 session 有記錄:');
        console.log(`   名稱: ${contact.name || contact.notify}`);
        console.log(`   JID: ${contact.jid}\n`);
    } else {
        console.log('❌ 當前 session 沒有這個群組的聯絡人記錄\n');
    }
    
    // 2. 檢查其他 session
    const { data: otherSessions } = await supabase
        .from('whatsapp_contacts')
        .select('session_id, name, notify')
        .eq('jid', KIASU_JID);
    
    if (otherSessions && otherSessions.length > 0) {
        console.log('📋 在其他 session 找到:');
        otherSessions.forEach(c => {
            console.log(`   Session: ${c.session_id.substring(0, 20)}...`);
            console.log(`   名稱: ${c.name || c.notify}\n`);
        });
    }
    
    // 3. 檢查當前 session 有多少聯絡人
    const { count: currentCount } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID);
    
    console.log(`\n📊 當前 session 聯絡人總數: ${currentCount}`);
    
    // 4. 建議解決方案
    if (currentCount === 0) {
        console.log('\n⚠️  問題: 當前 session 沒有任何聯絡人記錄！');
        console.log('解決方案:');
        console.log('1. 從其他 session 複製聯絡人記錄到當前 session');
        console.log('2. 或修改代碼，在找不到聯絡人記錄時，從其他 session 查找');
    }
}

checkSessionContacts().catch(console.error);
