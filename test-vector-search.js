const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testVectorSearch() {
    try {
        console.log('🧪 測試向量搜索功能...\n');
        
        // 步驟 1: 生成查詢 embedding
        console.log('步驟 1: 生成查詢向量...');
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: ['誰是玩帆船的朋友？'],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }
        
        const data = await response.json();
        const queryEmbedding = data.data[0].embedding;
        console.log(`✅ 查詢向量生成成功 (維度: ${queryEmbedding.length})\n`);
        
        // 步驟 2: 測試數據庫函數是否存在
        console.log('步驟 2: 測試向量搜索函數...');
        const { data: docs, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.3, // 降低閾值
            match_count: 5
        });
        
        if (error) {
            console.error('❌ 向量搜索錯誤:', error);
            throw error;
        }
        
        console.log(`✅ 找到 ${docs ? docs.length : 0} 個相關文檔\n`);
        
        if (docs && docs.length > 0) {
            console.log('前3個文檔:');
            docs.slice(0, 3).forEach((doc, i) => {
                console.log(`\n${i + 1}. 相似度: ${(doc.similarity * 100).toFixed(1)}%`);
                console.log(`   內容: ${doc.content.substring(0, 100)}...`);
            });
        } else {
            console.log('⚠️  沒有找到任何相關文檔');
            console.log('可能原因:');
            console.log('- 相似度閾值太高');
            console.log('- embedding 為空');
            console.log('- 沒有匹配的文檔');
            
            // 檢查數據庫中的文檔
            const { count } = await supabase
                .from('rag_knowledge')
                .select('*', { count: 'exact', head: true })
                .not('embedding', 'is', null);
            
            console.log(`\n數據庫中有 ${count} 個已向量化的文檔`);
        }
        
    } catch (error) {
        console.error('測試失敗:', error);
    }
}

testVectorSearch();
