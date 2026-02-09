require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkKnowledge() {
    try {
        // 檢查總數
        const { count, error } = await supabase
            .from('rag_knowledge')
            .select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error('查詢錯誤:', error);
            return;
        }
        
        console.log(`✅ 數據庫中的知識文檔總數: ${count}`);
        
        // 檢查有 embedding 的數量
        const { count: embeddedCount, error: embError } = await supabase
            .from('rag_knowledge')
            .select('*', { count: 'exact', head: true })
            .not('embedding', 'is', null);
        
        if (!embError) {
            console.log(`✅ 已生成向量的文檔數: ${embeddedCount}`);
        }
        
        // 查看前5條記錄
        const { data, error: fetchError } = await supabase
            .from('rag_knowledge')
            .select('id, content, source_type, session_id')
            .order('id', { ascending: true })
            .limit(5);
        
        if (!fetchError && data) {
            console.log('\n前5條記錄:');
            data.forEach((doc, i) => {
                console.log(`${i+1}. [${doc.source_type}] ${doc.content.substring(0, 100)}...`);
            });
        }
        
    } catch (err) {
        console.error('執行失敗:', err);
    }
}

checkKnowledge();
