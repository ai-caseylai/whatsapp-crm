// 為圖片消息生成描述並向量化
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // 需要 OpenAI API key 用於 Vision
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 使用 OpenAI Vision API 分析圖片
async function analyzeImage(imageUrl) {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: '請用繁體中文詳細描述這張圖片的內容，包括：場景、人物、物品、活動、文字等。描述要具體且適合用於搜索。'
                            },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 300
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vision API 錯誤: ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('圖片分析失敗:', error.message);
        return null;
    }
}

// 生成 embedding
async function generateEmbedding(text) {
    try {
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JINA_API_KEY}`
            },
            body: JSON.stringify({
                input: [text],
                model: 'jina-embeddings-v2-base-zh'
            })
        });

        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    } catch (error) {
        console.error('Embedding 生成失敗:', error.message);
        return null;
    }
}

async function processImageMessages() {
    console.log('='.repeat(60));
    console.log('🖼️  圖片消息處理與向量化');
    console.log('='.repeat(60));
    console.log();

    try {
        // 步驟 1: 獲取所有圖片消息
        console.log('步驟 1: 查找圖片消息...');
        
        let allImageMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .eq('message_type', 'image')
                .not('media_url', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allImageMessages = allImageMessages.concat(messages);
            page++;
            console.log(`   已加載 ${allImageMessages.length} 條圖片消息...`);
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allImageMessages.length} 條圖片消息\n`);
        
        if (allImageMessages.length === 0) {
            console.log('⚠️  沒有找到圖片消息');
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

        // 步驟 3: 處理圖片（限制處理數量以避免成本過高）
        const PROCESS_LIMIT = 50; // 限制處理前 50 張圖片
        const messagesToProcess = allImageMessages.slice(0, PROCESS_LIMIT);
        
        console.log(`步驟 3: 分析圖片內容（處理前 ${messagesToProcess.length} 張）...`);
        console.log('⚠️  這會使用 OpenAI Vision API，可能需要一些時間和成本\n');
        
        const imageDocuments = [];
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            
            console.log(`[${i + 1}/${messagesToProcess.length}] 處理圖片...`);
            
            try {
                // 分析圖片
                const description = await analyzeImage(msg.media_url);
                
                if (!description) {
                    console.log(`   ❌ 圖片分析失敗`);
                    failCount++;
                    continue;
                }
                
                console.log(`   ✅ 描述: ${description.substring(0, 80)}...`);
                
                // 生成 embedding
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const fullContent = `${contactName} 在 ${timestamp} 分享的圖片：\n${description}`;
                
                const embedding = await generateEmbedding(fullContent);
                
                if (!embedding) {
                    console.log(`   ❌ Embedding 生成失敗`);
                    failCount++;
                    continue;
                }
                
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
                        caption: msg.content || null
                    }
                });
                
                successCount++;
                
                // 避免 API rate limit
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.log(`   ❌ 處理失敗: ${error.message}`);
                failCount++;
            }
        }
        
        console.log(`\n✅ 圖片分析完成！`);
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
                    
                    if (savedCount % 10 === 0) {
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
        console.log(`總圖片數: ${allImageMessages.length}`);
        console.log(`已處理: ${messagesToProcess.length}`);
        console.log(`成功: ${successCount}`);
        console.log(`失敗: ${failCount}`);
        console.log('='.repeat(60));
        
        if (allImageMessages.length > PROCESS_LIMIT) {
            console.log(`\n💡 提示: 還有 ${allImageMessages.length - PROCESS_LIMIT} 張圖片未處理`);
            console.log('   可以修改 PROCESS_LIMIT 來處理更多圖片（注意 API 成本）');
        }
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

// 檢查環境變數
if (!OPENAI_API_KEY) {
    console.error('❌ 錯誤: 缺少 OPENAI_API_KEY 環境變數');
    console.log('請在 .env 文件中添加: OPENAI_API_KEY=你的API密鑰');
    process.exit(1);
}

processImageMessages();
