// 使用 OpenRouter API 為圖片生成描述並向量化
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 配置：選擇要使用的 Vision 模型
const VISION_MODELS = {
    // 💰 超便宜模型（推薦使用）
    'qwen-vl-max': 'qwen/qwen-vl-max',                   // $0.0002 - 超便宜且快速 ⭐⭐⭐⭐⭐
    'gemini-flash': 'google/gemini-flash-1.5-8b',       // $0.00125 - Google 官方
    'claude-3.5-haiku': 'anthropic/claude-3.5-haiku',   // $0.001 - 最佳性價比 ⭐⭐⭐⭐⭐
    
    // 💰💰 便宜模型（$0.001-0.005/張）
    'gpt-4o-mini': 'openai/gpt-4o-mini',                 // $0.002 - 穩定可靠
    'claude-3-haiku': 'anthropic/claude-3-haiku',        // $0.003 - 質量好
    
    // 💰💰💰 高質量模型（>$0.01/張）
    'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',  // $0.015 - 最高質量 ⭐⭐⭐⭐⭐
    'gpt-4o': 'openai/gpt-4o',                           // $0.015 - OpenAI 旗艦
    'gemini-pro': 'google/gemini-pro-1.5'                // $0.005 - Google 高質量
};

// 🎯 默認使用 Qwen VL Max（超便宜且快速！）
const SELECTED_MODEL = process.env.VISION_MODEL || VISION_MODELS['qwen-vl-max'];

// 使用 OpenRouter Vision API 分析圖片
async function analyzeImageWithOpenRouter(imageUrl) {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000', // 可選：用於統計
                'X-Title': 'WhatsApp CRM Image Analysis' // 可選：顯示在 OpenRouter 儀表板
            },
            body: JSON.stringify({
                model: SELECTED_MODEL,
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
            throw new Error(`OpenRouter API 錯誤: ${error}`);
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
    console.log('🖼️  圖片消息處理與向量化 (OpenRouter)');
    console.log('='.repeat(60));
    console.log(`🤖 使用模型: ${SELECTED_MODEL}`);
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
        
        // 先嘗試從當前 session 獲取
        let { data: contacts } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify')
            .eq('session_id', SESSION_ID)
            .in('jid', jids);
        
        // 如果沒有，從所有 session 查找
        if (!contacts || contacts.length === 0) {
            console.log('   從其他 session 查找聯絡人名稱...');
            const { data: allContacts } = await supabase
                .from('whatsapp_contacts')
                .select('jid, name, notify')
                .in('jid', jids);
            
            const contactMap = new Map();
            allContacts?.forEach(c => {
                if (!contactMap.has(c.jid) || (c.name && !contactMap.get(c.jid).name)) {
                    contactMap.set(c.jid, c);
                }
            });
            contacts = Array.from(contactMap.values());
        }
        
        const contactMap = new Map();
        contacts?.forEach(c => {
            contactMap.set(c.jid, c.name || c.notify || c.jid);
        });
        
        console.log(`✅ 獲取了 ${contacts?.length || 0} 個聯絡人名稱\n`);

        // 步驟 3: 處理圖片
        const PROCESS_LIMIT = 100; // 可以處理更多，OpenRouter 通常更便宜
        const messagesToProcess = allImageMessages.slice(0, PROCESS_LIMIT);
        
        console.log(`步驟 3: 分析圖片內容（處理前 ${messagesToProcess.length} 張）...`);
        
        // 根據模型計算預估成本
        const modelCosts = {
            'qwen/qwen-vl-max': 0.0002,
            'google/gemini-flash-1.5-8b': 0.00125,
            'anthropic/claude-3.5-haiku': 0.001,
            'openai/gpt-4o-mini': 0.002,
            'anthropic/claude-3-haiku': 0.003,
            'google/gemini-pro-1.5': 0.005,
            'anthropic/claude-3.5-sonnet': 0.015,
            'openai/gpt-4o': 0.015
        };
        const costPerImage = modelCosts[SELECTED_MODEL] || 0.002;
        const estimatedCost = messagesToProcess.length * costPerImage;
        
        if (estimatedCost === 0) {
            console.log(`💰 成本: 🆓 免費！\n`);
        } else {
            console.log(`💰 預估成本: 約 $${estimatedCost.toFixed(3)} USD (${costPerImage === 0 ? '免費' : `$${costPerImage}/張`})\n`);
        }
        
        const imageDocuments = [];
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            
            console.log(`[${i + 1}/${messagesToProcess.length}] 處理圖片...`);
            console.log(`   來源: ${contactName}`);
            console.log(`   URL: ${msg.media_url.substring(0, 60)}...`);
            
            try {
                // 分析圖片
                const description = await analyzeImageWithOpenRouter(msg.media_url);
                
                if (!description) {
                    console.log(`   ❌ 圖片分析失敗\n`);
                    failCount++;
                    continue;
                }
                
                console.log(`   ✅ 描述: ${description.substring(0, 100)}...`);
                
                // 生成 embedding
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const caption = msg.content ? `\n原始說明: ${msg.content}` : '';
                const fullContent = `${contactName} 在 ${timestamp} 分享的圖片：\n${description}${caption}`;
                
                const embedding = await generateEmbedding(fullContent);
                
                if (!embedding) {
                    console.log(`   ❌ Embedding 生成失敗\n`);
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
                        caption: msg.content || null,
                        ai_description: description,
                        model: SELECTED_MODEL
                    }
                });
                
                successCount++;
                console.log(`   ✅ 完成 (${successCount}/${messagesToProcess.length})\n`);
                
                // 避免 API rate limit
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.log(`   ❌ 處理失敗: ${error.message}\n`);
                failCount++;
                await new Promise(resolve => setTimeout(resolve, 3000));
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
        if (costPerImage === 0) {
            console.log(`實際成本: 🆓 免費！`);
        } else {
            console.log(`實際成本: 約 $${(successCount * costPerImage).toFixed(3)} USD`);
        }
        console.log('='.repeat(60));
        
        if (allImageMessages.length > PROCESS_LIMIT) {
            console.log(`\n💡 提示: 還有 ${allImageMessages.length - PROCESS_LIMIT} 張圖片未處理`);
            console.log('   可以修改 PROCESS_LIMIT 來處理更多圖片');
        }
        
    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

// 檢查環境變數
if (!OPENROUTER_API_KEY) {
    console.error('❌ 錯誤: 缺少 OPENROUTER_API_KEY 環境變數');
    console.log('請在 .env 文件中添加: OPENROUTER_API_KEY=你的API密鑰');
    console.log('獲取 API 密鑰: https://openrouter.ai/keys');
    process.exit(1);
}

processImageMessages();
