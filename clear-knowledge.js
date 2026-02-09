// 清空並重新向量化所有消息
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function clearAndRestart() {
    console.log('🗑️  清空現有知識庫...');
    
    const { error } = await supabase
        .from('rag_knowledge')
        .delete()
        .neq('id', 0); // 刪除所有記錄
    
    if (error) {
        console.error('清空失敗:', error);
    } else {
        console.log('✅ 清空完成！');
        console.log('\n現在可以運行: node rebuild-and-vectorize.js');
    }
}

clearAndRestart();
