const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStatus() {
    console.log('📊 檢查向量化狀態...\n');
    
    // 總數
    const { count: total } = await supabase
        .from('rag_knowledge')
        .select('*', { count: 'exact', head: true });
    console.log(`總文檔數: ${total}`);
    
    // 已向量化
    const { count: withEmbedding } = await supabase
        .from('rag_knowledge')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
    console.log(`已向量化: ${withEmbedding}`);
    
    // 未向量化
    const missing = total - withEmbedding;
    console.log(`未向量化: ${missing}`);
    console.log(`成功率: ${((withEmbedding / total) * 100).toFixed(1)}%`);
    
    if (missing > 0) {
        console.log(`\n⚠️  需要重新處理 ${missing} 個文檔`);
    } else {
        console.log('\n✅ 所有文檔都已向量化！');
    }
}

checkStatus().catch(console.error);
