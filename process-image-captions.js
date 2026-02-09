// 手動為圖片添加描述（不使用 Vision API）
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 為圖片消息使用 caption 作為描述
async function processImageMessagesWithCaption() {
    console.log('='.repeat(60));
    console.log('🖼️  使用圖片說明文字進行向量化');
    console.log('='.repeat(60));
    console.log();

    try {
        // 獲取有 caption 的圖片消息
        console.log('步驟 1: 查找有說明文字的圖片消息...');
        
        let allImageMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .eq('message_type', 'image')
                .not('content', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allImageMessages = allImageMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allImageMessages.length} 條有說明文字的圖片消息\n`);
        
        if (allImageMessages.length === 0) {
            console.log('⚠️  沒有找到有說明文字的圖片消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allImageMessages.map(m => m.remote_jid))];
        const { data: contacts } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify')
            .in('jid', jids);
        
        const contactMap = new Map();
        contacts?.forEach(c => {
            contactMap.set(c.jid, c.name || c.notify || c.jid);
        });
        
        console.log(`✅ 獲取了 ${contacts?.length || 0} 個聯絡人名稱\n`);

        // 步驟 3: 生成 embeddings
        console.log('步驟 3: 為圖片說明生成向量...\n');
        
        const imageDocuments = [];
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < allImageMessages.length; i++) {
            const msg = allImageMessages[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            
            if ((i + 1) % 10 === 0) {
                console.log(`   處理進度: ${i + 1}/${allImageMessages.length}`);
            }
            
            try {
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const fullContent = `${contactName} 在 ${timestamp} 分享的圖片：${msg.content}`;
                
                // 生成 embedding
                const response = await fetch('https://api.jina.ai/v1/embeddings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${JINA_API_KEY}`
                    },
                    body: JSON.stringify({
                        input: [fullContent],
                        model: 'jina-embeddings-v2-base-zh'
                    })
                });

                if (!response.ok) {
                    failCount++;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }

                const data = await response.json();
                const embedding = data.data[0].embedding;
                
                imageDocuments.push({
                    content: fullContent,
                    embedding: embedding,
                    session_id: SESSION_ID,
                    source_type: 'image',
                    metadata: {
                        message_id: msg.id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        media_url: msg.media_url,
                        timestamp: msg.message_timestamp,
                        caption: msg.content
                    }
                });
                
                successCount++;
                
                // 避免 API rate limit
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                failCount++;
            }
        }
        
        console.log(`\n✅ Embedding 生成完成！`);
        console.log(`   成功: ${successCount}`);
        console.log(`   失敗: ${failCount}\n`);
        
        // 步驟 4: 保存到數據庫
        if (imageDocuments.length > 0) {
            console.log('步驟 4: 保存到知識庫...');
            
            let savedCount = 0;
            for (const doc of imageDocuments) {
                try {
                    const { error } = await supabase
                        .from('rag_knowledge')
                        .insert(doc);
                    
                    if (error) throw error;
                    savedCount++;
                    
                    if (savedCount % 50 === 0) {
                        console.log(`   已保存 ${savedCount}/${imageDocuments.length} 個文檔...`);
                    }
                } catch (error) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
            
            console.log(`\n✅ 保存完成！共保存 ${savedCount} 個圖片文檔`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 圖片處理完成！');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

processImageMessagesWithCaption();
