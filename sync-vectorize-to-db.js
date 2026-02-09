// 將內存中的 RAG 知識庫同步到數據庫
const http = require('http');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 從服務器獲取知識庫
function getKnowledgeBase() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/rag/knowledge-base',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    if (result.success) {
                        resolve(result.documents);
                    } else {
                        reject(new Error(result.error || '獲取知識庫失敗'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// 批量生成 embeddings
async function batchGenerateEmbeddings(texts, onProgress) {
    const BATCH_SIZE = 10;
    const DELAY_MS = 500;
    const allEmbeddings = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
        
        try {
            const response = await fetch('https://api.jina.ai/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${JINA_API_KEY}`
                },
                body: JSON.stringify({
                    input: batch,
                    model: 'jina-embeddings-v2-base-zh'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`❌ 批次 ${batchNum}/${totalBatches} 失敗:`, error);
                for (let j = 0; j < batch.length; j++) {
                    allEmbeddings.push(null);
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            const result = await response.json();
            const embeddings = result.data.map(item => item.embedding);
            allEmbeddings.push(...embeddings);
            
            if (onProgress) {
                onProgress(i + batch.length, texts.length, batchNum, totalBatches);
            }
            
            if (i + BATCH_SIZE < texts.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
            
        } catch (error) {
            console.error(`❌ 批次 ${batchNum}/${totalBatches} 異常:`, error.message);
            for (let j = 0; j < batch.length; j++) {
                allEmbeddings.push(null);
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return allEmbeddings;
}

async function main() {
    console.log('='.repeat(60));
    console.log('🚀 WhatsApp 數據向量化 - 完整流程');
    console.log('='.repeat(60));
    console.log();
    
    try {
        // 步驟 1: 獲取內存中的知識庫
        console.log('📚 步驟 1: 從服務器獲取知識庫...');
        const documents = await getKnowledgeBase();
        console.log(`✅ 成功獲取 ${documents.length} 個文檔\n`);
        
        if (documents.length === 0) {
            console.log('⚠️  知識庫為空，請先構建知識庫');
            return;
        }
        
        // 步驟 2: 生成 embeddings
        console.log('🧠 步驟 2: 生成 Embeddings...');
        console.log(`   模型: jina-embeddings-v2-base-zh`);
        console.log(`   維度: 768\n`);
        
        let processedCount = 0;
        const embeddings = await batchGenerateEmbeddings(documents, (current, total, batchNum, totalBatches) => {
            processedCount = current;
            const percent = ((current / total) * 100).toFixed(1);
            console.log(`   批次 ${batchNum}/${totalBatches} ✅ 進度: ${current}/${total} (${percent}%)`);
        });
        
        console.log(`\n✅ Embeddings 生成完成！\n`);
        
        // 步驟 3: 保存到數據庫
        console.log('💾 步驟 3: 保存到數據庫...');
        
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;
        
        for (let i = 0; i < documents.length; i++) {
            const doc = documents[i];
            const embedding = embeddings[i];
            
            if (!embedding) {
                skippedCount++;
                continue;
            }
            
            // 判斷文檔類型
            let sourceType = 'manual';
            if (i < 4) {
                sourceType = 'system';
            } else if (doc.includes('聯絡人資料:')) {
                sourceType = 'contact';
            } else if (doc.includes('對話:') || doc.includes('訊息:')) {
                sourceType = 'conversation';
            }
            
            const { error } = await supabase
                .from('rag_knowledge')
                .insert({
                    content: doc,
                    embedding: embedding,
                    session_id: 'sess_id73sa6oi_1770363274857',
                    source_type: sourceType
                });
            
            if (error) {
                console.error(`   ❌ 文檔 ${i + 1} 保存失敗:`, error.message);
                failCount++;
            } else {
                successCount++;
                if (successCount % 100 === 0) {
                    console.log(`   已保存 ${successCount}/${documents.length} 個文檔...`);
                }
            }
        }
        
        console.log(`\n✅ 數據同步完成！`);
        console.log('='.repeat(60));
        console.log(`📊 最終統計:`);
        console.log(`   總文檔數:   ${documents.length}`);
        console.log(`   成功保存:   ${successCount}`);
        console.log(`   失敗:       ${failCount}`);
        console.log(`   跳過:       ${skippedCount}`);
        console.log(`   成功率:     ${((successCount/documents.length)*100).toFixed(2)}%`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error.message);
        console.error(error);
    }
}

main();
