const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function searchSailing() {
    try {
        console.log('🔍 搜索：誰是玩帆船的朋友？\n');
        
        // 步驟 1: 生成查詢 embedding
        console.log('步驟 1: 生成查詢向量...');
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: ['帆船 sailing 玩帆船的朋友 帆船運動'],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }
        
        const data = await response.json();
        const queryEmbedding = data.data[0].embedding;
        console.log(`✅ 查詢向量生成成功\n`);
        
        // 步驟 2: 向量搜索
        console.log('步驟 2: 搜索相關對話...');
        const { data: docs, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: 0.2, // 降低閾值以獲得更多結果
            match_count: 10
        });
        
        if (error) {
            console.error('❌ 向量搜索錯誤:', error);
            throw error;
        }
        
        console.log(`✅ 找到 ${docs ? docs.length : 0} 個相關文檔\n`);
        
        if (docs && docs.length > 0) {
            console.log('=' .repeat(80));
            console.log('🎯 搜索結果：');
            console.log('='.repeat(80));
            
            // 提取聯絡人和相關對話
            const contactMatches = new Map();
            
            docs.forEach((doc, i) => {
                const similarity = (doc.similarity * 100).toFixed(1);
                const jid = doc.metadata?.jid || 'unknown';
                const contactName = doc.metadata?.contact_name || jid;
                
                if (!contactMatches.has(jid)) {
                    contactMatches.set(jid, {
                        name: contactName,
                        conversations: [],
                        maxSimilarity: 0
                    });
                }
                
                const contact = contactMatches.get(jid);
                contact.conversations.push({
                    similarity: parseFloat(similarity),
                    content: doc.content
                });
                contact.maxSimilarity = Math.max(contact.maxSimilarity, parseFloat(similarity));
            });
            
            // 按相似度排序並顯示
            const sortedContacts = Array.from(contactMatches.entries())
                .sort((a, b) => b[1].maxSimilarity - a[1].maxSimilarity);
            
            console.log(`\n找到 ${sortedContacts.length} 個可能玩帆船的朋友：\n`);
            
            sortedContacts.forEach(([jid, info], index) => {
                console.log(`${index + 1}. 👤 ${info.name}`);
                console.log(`   JID: ${jid}`);
                console.log(`   最高相似度: ${info.maxSimilarity}%`);
                console.log(`   相關對話數: ${info.conversations.length}`);
                console.log('\n   📝 相關對話片段：');
                
                info.conversations.slice(0, 2).forEach((conv, i) => {
                    console.log(`\n   [相似度: ${conv.similarity}%]`);
                    const preview = conv.content.substring(0, 300).replace(/\n/g, '\n   ');
                    console.log(`   ${preview}...`);
                });
                
                console.log('\n' + '-'.repeat(80) + '\n');
            });
            
        } else {
            console.log('⚠️  沒有找到相關的對話');
            console.log('可能原因:');
            console.log('- 沒有關於帆船的對話內容');
            console.log('- 向量化還在進行中');
            console.log('- 相似度閾值太高');
        }
        
    } catch (error) {
        console.error('❌ 搜索失敗:', error);
    }
}

searchSailing();
