// 重新構建知識庫並向量化 - 使用更保守的速率避免 API limit
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 從數據庫構建知識庫
async function buildKnowledgeFromDatabase() {
    const documents = [];
    
    try {
        console.log('📚 從數據庫構建知識庫...\n');
        
        // 獲取所有消息（使用分頁處理大量數據）
        console.log('💬 正在獲取消息記錄...');
        let allMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error: msgError } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (msgError) throw msgError;
            
            if (!messages || messages.length === 0) break;
            
            allMessages = allMessages.concat(messages);
            page++;
            console.log(`   已加載 ${allMessages.length} 條消息...`);
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 總共找到 ${allMessages.length} 條消息`);
        
        // 按聯絡人分組消息
        const messagesByContact = {};
        for (const msg of allMessages) {
            const key = msg.remote_jid;
            if (!messagesByContact[key]) {
                messagesByContact[key] = [];
            }
            messagesByContact[key].push(msg);
        }
        
        console.log(`✅ 找到 ${Object.keys(messagesByContact).length} 個聯絡人`);
        
        // 從 whatsapp_contacts 表獲取正確的聯絡人/群組名稱
        console.log('👥 正在獲取聯絡人名稱...');
        const jids = Object.keys(messagesByContact);
        
        // 先嘗試從當前 session 獲取
        let { data: contacts, error: contactsError } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify, is_group')
            .eq('session_id', SESSION_ID)
            .in('jid', jids);
        
        // 如果當前 session 沒有記錄，從所有 session 查找（去重）
        if (!contacts || contacts.length === 0) {
            console.log('⚠️  當前 session 沒有聯絡人記錄，從其他 session 查找...');
            const { data: allContacts } = await supabase
                .from('whatsapp_contacts')
                .select('jid, name, notify, is_group')
                .in('jid', jids);
            
            // 去重：每個 JID 只取第一個有名稱的記錄
            const contactMap = new Map();
            allContacts?.forEach(c => {
                if (!contactMap.has(c.jid) || (c.name && !contactMap.get(c.jid).name)) {
                    contactMap.set(c.jid, c);
                }
            });
            contacts = Array.from(contactMap.values());
        }
        
        if (contactsError) {
            console.log('⚠️  無法獲取聯絡人表資料，將使用 JID 作為名稱');
        }
        
        // 創建 JID 到名稱的映射
        const contactInfo = {};
        for (const jid of jids) {
            const contact = contacts?.find(c => c.jid === jid);
            contactInfo[jid] = {
                jid: jid,
                name: contact ? (contact.name || contact.notify || jid) : jid,
                is_group: jid.includes('@g.us')
            };
        }
        
        console.log(`✅ 已獲取 ${contacts?.length || 0} 個聯絡人的名稱`);
        
        // 為每個聯絡人創建簡單的資料文檔
        for (const [jid, info] of Object.entries(contactInfo)) {
            const messageCount = messagesByContact[jid].length;
            const doc = `聯絡人: ${info.name}
JID: ${info.jid}
類型: ${info.is_group ? '群組' : '個人'}
消息數: ${messageCount}`;
            
            documents.push({
                content: doc,
                source_type: 'contact',
                session_id: SESSION_ID,
                metadata: {
                    jid: info.jid,
                    name: info.name,
                    is_group: info.is_group,
                    message_count: messageCount
                }
            });
        }
        
        // 為每個聯絡人的對話創建知識文檔
        console.log('\n📝 正在組織對話記錄...');
        for (const [jid, msgs] of Object.entries(messagesByContact)) {
            const contactName = contactInfo[jid].name;
            
            // 每 20 條消息創建一個文檔
            for (let i = 0; i < msgs.length; i += 20) {
                const batch = msgs.slice(i, i + 20);
                const conversation = batch
                    .map(m => {
                        const time = new Date(m.message_timestamp).toLocaleString('zh-TW');
                        const sender = m.from_me ? '我' : (m.push_name || m.participant_phone || jid);
                        const content = m.content || `[${m.message_type}]`;
                        return `[${time}] ${sender}: ${content}`;
                    })
                    .join('\n');
                
                documents.push({
                    content: `與 ${contactName} 的對話:\n${conversation}`,
                    source_type: 'conversation',
                    session_id: SESSION_ID,
                    metadata: {
                        jid: jid,
                        contact_name: contactName,
                        message_count: batch.length,
                        time_range: {
                            from: batch[batch.length - 1].message_timestamp,
                            to: batch[0].message_timestamp
                        }
                    }
                });
            }
        }
        
        console.log(`\n✅ 知識庫構建完成！總共 ${documents.length} 個文檔`);
        return documents;
        
    } catch (error) {
        console.error('❌ 構建知識庫失敗:', error);
        throw error;
    }
}

// 批量生成 embeddings - 使用更保守的速率
async function batchGenerateEmbeddings(documents, onProgress) {
    const BATCH_SIZE = 3;  // 更小的批次
    const DELAY_MS = 2000;  // 更長的延遲（2秒）
    const results = [];
    
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(documents.length / BATCH_SIZE);
        
        try {
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
                console.error(`❌ 批次 ${batchNum}/${totalBatches} 失敗:`, error.substring(0, 100));
                for (let j = 0; j < batch.length; j++) {
                    results.push({ ...batch[j], embedding: null, error: error });
                }
                await new Promise(resolve => setTimeout(resolve, 5000)); // 失敗後等更久
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
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    return results;
}

async function main() {
    console.log('='.repeat(60));
    console.log('🚀 WhatsApp 知識庫重建與向量化（保守模式）');
    console.log('='.repeat(60));
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`⚙️  批次大小: 3 文檔/批次`);
    console.log(`⏱️  延遲時間: 2000ms/批次`);
    console.log('='.repeat(60));
    console.log();
    
    try {
        // 步驟 0: 清空舊數據
        console.log('🗑️  步驟 0: 清空舊的知識庫數據...');
        const { error: deleteError } = await supabase
            .from('rag_knowledge')
            .delete()
            .eq('session_id', SESSION_ID);
        
        if (deleteError) throw deleteError;
        console.log('✅ 舊數據已清空\n');
        
        // 步驟 1: 從數據庫構建知識庫
        const documents = await buildKnowledgeFromDatabase();
        
        if (documents.length === 0) {
            console.log('⚠️  沒有找到任何數據');
            return;
        }
        
        // 步驟 2: 生成 embeddings
        console.log('\n🧠 步驟 2: 生成 Embeddings（這會需要較長時間）...');
        console.log(`   模型: jina-embeddings-v2-base-zh`);
        console.log(`   文檔數: ${documents.length}`);
        console.log(`   預估時間: ${Math.ceil(documents.length / 3 * 2 / 60)} 分鐘\n`);
        
        const documentsWithEmbeddings = await batchGenerateEmbeddings(documents, (current, total, batchNum, totalBatches) => {
            const percent = ((current / total) * 100).toFixed(1);
            console.log(`   批次 ${batchNum}/${totalBatches} ✅ 進度: ${current}/${total} (${percent}%)`);
        });
        
        console.log(`\n✅ Embeddings 生成完成！\n`);
        
        // 計算成功和失敗數量
        const withEmbedding = documentsWithEmbeddings.filter(d => d.embedding).length;
        const withoutEmbedding = documentsWithEmbeddings.filter(d => !d.embedding).length;
        
        console.log(`📊 Embedding 生成統計:`);
        console.log(`   成功: ${withEmbedding}`);
        console.log(`   失敗: ${withoutEmbedding}`);
        console.log(`   成功率: ${((withEmbedding / documents.length) * 100).toFixed(1)}%\n`);
        
        // 步驟 3: 保存到數據庫（只保存成功的）
        console.log('💾 步驟 3: 保存到數據庫...\n');
        
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
                    .insert({
                        content: doc.content,
                        embedding: doc.embedding,
                        session_id: doc.session_id,
                        source_type: doc.source_type,
                        metadata: doc.metadata
                    });
                
                if (error) throw error;
                successCount++;
                
                if (successCount % 50 === 0) {
                    console.log(`   已保存 ${successCount}/${withEmbedding} 個文檔...`);
                }
            } catch (error) {
                failCount++;
                if (failCount <= 5) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 向量化完成！');
        console.log('='.repeat(60));
        console.log(`📊 最終統計:`);
        console.log(`   生成 embedding 成功: ${withEmbedding}`);
        console.log(`   生成 embedding 失敗: ${withoutEmbedding}`);
        console.log(`   保存到數據庫成功: ${successCount}`);
        console.log(`   保存到數據庫失敗: ${failCount}`);
        console.log('='.repeat(60));
        
        if (withoutEmbedding > 0) {
            console.log(`\n⚠️  注意: 有 ${withoutEmbedding} 個文檔沒有成功生成 embedding`);
            console.log('   建議稍後運行 retry-failed-embeddings.js 重試失敗的文檔');
        }
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

main();
