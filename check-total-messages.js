const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkTotal() {
    const { count, error } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID);
    
    if (error) {
        console.error('錯誤:', error);
        return;
    }
    
    console.log(`📊 Session ${SESSION_ID} 的總消息數: ${count}`);
    console.log(`✅ 當前已向量化: 85 個文檔 (基於前 1000 條消息)`);
    
    if (count > 1000) {
        console.log(`⚠️  還有 ${count - 1000} 條消息未處理`);
        console.log(`💡 可以增加限制來處理所有消息`);
    }
}

checkTotal();
