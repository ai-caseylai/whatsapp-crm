// 檢查數據庫中的 embeddings 狀態
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkStatus() {
    console.log('🔍 檢查 RAG 知識庫向量化狀態...\n');
    
    // 總文檔數
    const { count: totalCount, error: totalError } = await supabase
        .from('rag_knowledge')
        .select('*', { count: 'exact', head: true });
    
    if (totalError) {
        console.error('❌ 查詢總數失敗:', totalError);
        return;
    }
    
    // 已向量化的文檔數
    const { count: embeddedCount, error: embeddedError } = await supabase
        .from('rag_knowledge')
        .select('*', { count: 'exact', head: true })
        .not('embedding', 'is', null);
    
    if (embeddedError) {
        console.error('❌ 查詢已向量化數量失敗:', embeddedError);
        return;
    }
    
    // 未向量化的文檔數
    const pendingCount = totalCount - embeddedCount;
    const percentage = totalCount > 0 ? ((embeddedCount / totalCount) * 100).toFixed(2) : 0;
    
    console.log('📊 統計結果:');
    console.log('='.repeat(50));
    console.log(`總文檔數:     ${totalCount}`);
    console.log(`已向量化:     ${embeddedCount} (${percentage}%)`);
    console.log(`未向量化:     ${pendingCount}`);
    console.log('='.repeat(50));
    
    if (pendingCount > 0) {
        console.log(`\n⚠️  還有 ${pendingCount} 個文檔需要向量化`);
        console.log('💡 執行命令: node complete-vectorize.js');
    } else {
        console.log('\n✅ 所有文檔已完成向量化！');
    }
}

checkStatus().catch(console.error);
