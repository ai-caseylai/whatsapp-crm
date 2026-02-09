// 完成所有剩余文档的向量化
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 批量生成 embeddings
async function batchGenerateEmbeddings(texts, onProgress) {
    const BATCH_SIZE = 10;
    const DELAY_MS = 500;
    const allEmbeddings = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(texts.length / BATCH_SIZE);
        
        console.log(`正在處理批次 ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length})`);
        
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
                console.error(`❌ 批次 ${batchNum} 失败:`, error);
                
                // API 錯誤時加入空向量
                for (let j = 0; j < batch.length; j++) {
                    allEmbeddings.push(null);
                }
                
                // 增加延遲並重試
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            const result = await response.json();
            const embeddings = result.data.map(item => item.embedding);
            allEmbeddings.push(...embeddings);
            
            if (onProgress) {
                onProgress(i + batch.length, texts.length);
            }
            
            // 延遲以避免速率限制
            if (i + BATCH_SIZE < texts.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
            
        } catch (error) {
            console.error(`❌ 批次 ${batchNum} 異常:`, error.message);
            
            // 網絡錯誤時加入空向量
            for (let j = 0; j < batch.length; j++) {
                allEmbeddings.push(null);
            }
            
            // 增加延遲並繼續
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    return allEmbeddings;
}

async function main() {
    try {
        console.log('🔍 檢查知識庫狀態...');
        
        // 獲取所有未向量化的文檔
        const { data: pendingDocs, error: fetchError } = await supabase
            .from('rag_knowledge')
            .select('id, content')
            .is('embedding', null);
        
        if (fetchError) {
            console.error('❌ 查詢失敗:', fetchError);
            return;
        }
        
        console.log(`\n📊 統計信息:`);
        console.log(`待向量化文檔: ${pendingDocs.length} 個`);
        
        if (pendingDocs.length === 0) {
            console.log('✅ 所有文檔已完成向量化！');
            return;
        }
        
        console.log(`\n🚀 開始向量化處理...\n`);
        
        const texts = pendingDocs.map(doc => doc.content);
        let processedCount = 0;
        
        const embeddings = await batchGenerateEmbeddings(texts, (current, total) => {
            processedCount = current;
            const percent = ((current / total) * 100).toFixed(1);
            console.log(`✅ 進度: ${current}/${total} (${percent}%)`);
        });
        
        console.log(`\n💾 保存 embeddings 到數據庫...`);
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < pendingDocs.length; i++) {
            const doc = pendingDocs[i];
            const embedding = embeddings[i];
            
            if (!embedding) {
                console.log(`⚠️  文檔 ${doc.id} 跳過（embedding 失敗）`);
                failCount++;
                continue;
            }
            
            const { error: updateError } = await supabase
                .from('rag_knowledge')
                .update({ embedding: embedding })
                .eq('id', doc.id);
            
            if (updateError) {
                console.error(`❌ 更新文檔 ${doc.id} 失敗:`, updateError);
                failCount++;
            } else {
                successCount++;
                if ((successCount % 50) === 0) {
                    console.log(`  已保存 ${successCount}/${pendingDocs.length} 個 embeddings`);
                }
            }
        }
        
        console.log(`\n✅ 向量化完成！`);
        console.log(`   成功: ${successCount} 個`);
        console.log(`   失敗: ${failCount} 個`);
        
        // 最終統計
        const { data: finalStats } = await supabase
            .from('rag_knowledge')
            .select('id', { count: 'exact', head: false });
        
        const { data: embeddedStats } = await supabase
            .from('rag_knowledge')
            .select('id', { count: 'exact', head: false })
            .not('embedding', 'is', null);
        
        const totalDocs = finalStats?.length || 0;
        const embeddedDocs = embeddedStats?.length || 0;
        const pendingDocs2 = totalDocs - embeddedDocs;
        
        console.log(`\n📊 最終統計:`);
        console.log(`   總文檔數: ${totalDocs}`);
        console.log(`   已向量化: ${embeddedDocs} (${((embeddedDocs/totalDocs)*100).toFixed(1)}%)`);
        console.log(`   未向量化: ${pendingDocs2}`);
        
    } catch (error) {
        console.error('❌ 執行失敗:', error);
    }
}

main();
