// 測試圖片搜索功能
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function searchImages(query) {
    try {
        console.log(`🔍 搜索圖片: "${query}"\n`);
        
        // 生成查詢 embedding
        console.log('步驟 1: 生成查詢向量...');
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: [query],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }
        
        const data = await response.json();
        const queryEmbedding = data.data[0].embedding;
        console.log(`✅ 查詢向量生成成功\n`);
        
        // 向量搜索（只搜索圖片類型）
        console.log('步驟 2: 搜索相關圖片...');
        const { data: docs, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.2,
            match_count: 10
        });
        
        if (error) {
            console.error('❌ 向量搜索錯誤:', error);
            throw error;
        }
        
        // 過濾只顯示圖片類型的結果
        const imageDocs = docs?.filter(d => d.metadata?.message_id) || [];
        
        console.log(`✅ 找到 ${imageDocs.length} 個相關圖片\n`);
        
        if (imageDocs.length > 0) {
            console.log('='.repeat(80));
            console.log('🎯 搜索結果：');
            console.log('='.repeat(80));
            
            imageDocs.forEach((doc, i) => {
                const similarity = (doc.similarity * 100).toFixed(1);
                const contactName = doc.metadata?.contact_name || 'Unknown';
                const timestamp = doc.metadata?.timestamp 
                    ? new Date(doc.metadata.timestamp).toLocaleString('zh-TW')
                    : 'Unknown';
                const mediaUrl = doc.metadata?.media_url || '';
                const caption = doc.metadata?.caption || '(無說明文字)';
                
                console.log(`\n${i + 1}. 👤 ${contactName}`);
                console.log(`   相似度: ${similarity}%`);
                console.log(`   時間: ${timestamp}`);
                console.log(`   圖片: ${mediaUrl}`);
                console.log(`   原始說明: ${caption}`);
                console.log(`\n   📝 AI 描述:`);
                const description = doc.content.split('分享的圖片：\n')[1] || doc.content;
                console.log(`   ${description}`);
                console.log('\n' + '-'.repeat(80));
            });
            
        } else {
            console.log('⚠️  沒有找到相關的圖片');
            console.log('可能原因:');
            console.log('- 還沒有處理圖片消息');
            console.log('- 沒有符合查詢的圖片內容');
            console.log('- 相似度閾值太高');
        }
        
    } catch (error) {
        console.error('❌ 搜索失敗:', error);
    }
}

// 從命令行獲取搜索查詢
const query = process.argv[2] || '帆船';
searchImages(query);
