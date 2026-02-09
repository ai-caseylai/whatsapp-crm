const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testDirectQuery() {
    try {
        console.log('🧪 測試直接 SQL 查詢...\n');
        
        // 生成查詢 embedding
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: ['帆船'],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        const data = await response.json();
        const queryEmbedding = data.data[0].embedding;
        console.log(`✅ 查詢向量生成成功\n`);
        
        // 測試 1: 不使用閾值，直接查詢
        console.log('測試 1: 不使用閾值...');
        const { data: docs1, error: error1 } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.0, // 無閾值
            match_count: 5
        });
        
        if (error1) {
            console.error('❌ 錯誤:', error1);
        } else {
            console.log(`✅ 找到 ${docs1.length} 個文檔`);
            if (docs1.length > 0) {
                docs1.forEach((doc, i) => {
                    console.log(`${i + 1}. 相似度: ${(doc.similarity * 100).toFixed(2)}% - ${doc.content.substring(0, 80)}...`);
                });
            }
        }
        
        console.log('\n測試 2: 關鍵詞搜索...');
        const { data: docs2, error: error2 } = await supabase
            .from('rag_knowledge')
            .select('*')
            .ilike('content', '%帆船%')
            .limit(5);
        
        if (error2) {
            console.error('❌ 錯誤:', error2);
        } else {
            console.log(`✅ 找到 ${docs2.length} 個包含「帆船」的文檔`);
            if (docs2.length > 0) {
                docs2.forEach((doc, i) => {
                    console.log(`${i + 1}. ${doc.content.substring(0, 100)}...`);
                });
            }
        }
        
    } catch (error) {
        console.error('測試失敗:', error);
    }
}

testDirectQuery();
