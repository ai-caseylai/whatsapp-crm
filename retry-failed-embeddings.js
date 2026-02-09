// 重新處理失敗的 embedding
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 批量生成 embeddings（降低批次大小避免 rate limit）
async function batchGenerateEmbeddings(documents, onProgress) {
    const BATCH_SIZE = 5;  // 從 10 降到 5
    const DELAY_MS = 1000;  // 從 500ms 增加到 1000ms
    const results = [];
    
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(documents.length / BATCH_SIZE);
        
        try {
            // 提取文本內容並確保是字符串
            const texts = batch.map(doc => {
                if (typeof doc.content === 'string') {
                    return doc.content.trim();
                }
                return String(doc.content || '').trim();
            }).filter(text => text.length > 0);
            
            if (texts.length === 0) {
                console.log(`⚠️  批次 ${batchNum}/${totalBatches} 跳過（無有效文本）`);
                for (let j = 0; j < batch.length; j++) {
                    results.push({ ...batch[j], embedding: null, error: 'No valid text' });
                }
                continue;
            }
            
            const response = await fetch('https://api.jina.ai/v1/embeddings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${JINA_API_KEY}`
                },
                body: JSON.stringify({
                    input: texts,
                    model: 'jina-embeddings-v2-base-zh'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error(`❌ 批次 ${batchNum}/${totalBatches} 失敗:`, error);
                for (let j = 0; j < batch.length; j++) {
                    results.push({ ...batch[j], embedding: null, error: error });
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            const result = await response.json();
            const embeddings = result.data.map(item => item.embedding);
            
            for (let j = 0; j < batch.length; j++) {
                results.push({ ...batch[j], embedding: embeddings[j] || null });
            }
            
            if (onProgress) {
                onProgress(i + batch.length, documents.length, batchNum, totalBatches);
            }
            
            await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            
        } catch (error) {
            console.error(`❌ 批次 ${batchNum}/${totalBatches} 異常:`, error.message);
            for (let j = 0; j < batch.length; j++) {
                results.push({ ...batch[j], embedding: null, error: error.message });
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return results;
}

async function retryFailed() {
    console.log('='.repeat(60));
    console.log('🔄 重新處理失敗的 Embeddings');
    console.log('='.repeat(60));
    console.log();
    
    try {
        // 步驟 1: 找出所有沒有 embedding 的文檔
        console.log('🔍 步驟 1: 查找沒有 embedding 的文檔...\n');
        
        let allDocs = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: docs, error } = await supabase
                .from('rag_knowledge')
                .select('id, content, session_id, source_type, metadata')
                .is('embedding', null)
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            
            if (!docs || docs.length === 0) break;
            
            allDocs = allDocs.concat(docs);
            page++;
            console.log(`   已加載 ${allDocs.length} 個文檔...`);
            
            if (docs.length < PAGE_SIZE) break;
        }
        
        console.log(`\n✅ 找到 ${allDocs.length} 個需要重新處理的文檔\n`);
        
        if (allDocs.length === 0) {
            console.log('🎉 沒有需要重新處理的文檔！');
            return;
        }
        
        // 步驟 2: 生成 embeddings
        console.log('🧠 步驟 2: 生成 Embeddings...');
        console.log(`   模型: jina-embeddings-v2-base-zh`);
        console.log(`   維度: 768`);
        console.log(`   文檔數: ${allDocs.length}\n`);
        
        const documentsWithEmbeddings = await batchGenerateEmbeddings(allDocs, (current, total, batchNum, totalBatches) => {
            const percent = ((current / total) * 100).toFixed(1);
            console.log(`   批次 ${batchNum}/${totalBatches} ✅ 進度: ${current}/${total} (${percent}%)`);
        });
        
        console.log(`\n✅ Embeddings 生成完成！\n`);
        
        // 步驟 3: 更新數據庫
        console.log('💾 步驟 3: 更新數據庫...\n');
        
        let successCount = 0;
        let failCount = 0;
        
        for (const doc of documentsWithEmbeddings) {
            if (!doc.embedding) {
                failCount++;
                continue;
            }
            
            try {
                const { error } = await supabase
                    .from('rag_knowledge')
                    .update({ embedding: doc.embedding })
                    .eq('id', doc.id);
                
                if (error) throw error;
                successCount++;
                
                if (successCount % 50 === 0) {
                    console.log(`   已更新 ${successCount}/${allDocs.length} 個文檔...`);
                }
            } catch (error) {
                failCount++;
                if (failCount <= 5) {
                    console.error(`   ❌ 更新失敗 (ID: ${doc.id}):`, error.message);
                }
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 重新處理完成！');
        console.log('='.repeat(60));
        console.log(`✅ 成功: ${successCount} 個文檔`);
        console.log(`❌ 失敗: ${failCount} 個文檔`);
        console.log(`📊 成功率: ${((successCount / allDocs.length) * 100).toFixed(1)}%`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

retryFailed();
