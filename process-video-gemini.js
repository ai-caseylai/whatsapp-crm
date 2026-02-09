// 使用 Gemini 1.5 Pro 處理視頻（視覺+音頻）
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
// 使用 GOOGLE_GEMINI_API_KEY，而非 GEMINI_API_KEY（那是 OpenRouter 的）
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 使用 Gemini 分析視頻
async function analyzeVideoWithGemini(filePath) {
    try {
        console.log(`   🎬 開始分析視頻...`);
        
        // 檢查文件大小
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        console.log(`   📊 文件大小: ${fileSizeMB.toFixed(2)}MB`);
        
        // Gemini 1.5 Pro 支援最長 1 小時的視頻
        if (fileSizeMB > 100) {
            console.log(`   ⚠️  文件過大 (${fileSizeMB.toFixed(2)}MB)，可能會失敗`);
        }
        
        // 讀取視頻文件
        const videoData = fs.readFileSync(filePath);
        const base64Video = videoData.toString('base64');
        
        // 確定 MIME 類型
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.webm': 'video/webm'
        };
        const mimeType = mimeTypes[ext] || 'video/mp4';
        
        // 調用 Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Video
                }
            },
            `請用繁體中文詳細描述這個視頻的內容，包括：

1. **視覺內容**：場景、人物、物品、活動、動作、環境等
2. **音頻內容**：如果有對話或聲音，請轉錄為文字（支援粵語）
3. **時間軸**：如果有明顯的場景變化，請描述
4. **整體主題**：這個視頻主要在展示什麼

請提供完整且詳細的描述。`
        ]);
        
        const response = await result.response;
        const description = response.text();
        
        console.log(`   ✅ 分析完成`);
        
        return description;
        
    } catch (error) {
        console.log(`   ❌ 分析失敗: ${error.message}`);
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
        console.error('   Embedding 生成失敗:', error.message);
        return null;
    }
}

// 主處理函數
async function processVideoMessages() {
    console.log('='.repeat(80));
    console.log('🎬 視頻轉文字處理（Gemini 1.5 Pro）');
    console.log('='.repeat(80));
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`💰 成本: ~$0.01/30秒視頻`);
    console.log('='.repeat(80));
    console.log();

    try {
        // 獲取所有視頻消息
        console.log('步驟 1: 查找視頻消息...\n');
        
        let allVideoMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .eq('message_type', 'videoMessage')
                .not('attachment_path', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allVideoMessages = allVideoMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allVideoMessages.length} 個視頻文件\n`);
        
        if (allVideoMessages.length === 0) {
            console.log('⚠️  沒有找到視頻消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allVideoMessages.map(m => m.remote_jid))];
        
        let { data: contacts } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify')
            .eq('session_id', SESSION_ID)
            .in('jid', jids);
        
        if (!contacts || contacts.length === 0) {
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

        // 處理限制
        const PROCESS_LIMIT = parseInt(process.argv[2]) || 20;
        const messagesToProcess = allVideoMessages.slice(0, PROCESS_LIMIT);
        
        // 估算成本（假設平均 30 秒）
        const estimatedCost = messagesToProcess.length * 0.01;
        
        console.log(`步驟 3: 處理視頻（前 ${messagesToProcess.length} 個）...`);
        console.log(`💰 預估成本: $${estimatedCost.toFixed(2)}\n`);

        const documents = [];
        const stats = {
            total: messagesToProcess.length,
            success: 0,
            failed: 0,
            actualCost: 0
        };

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            
            console.log(`[${i + 1}/${messagesToProcess.length}] 🎬 處理視頻...`);
            console.log(`   來源: ${contactName}`);
            
            try {
                const filePath = path.join(MEDIA_DIR, msg.attachment_path);
                
                if (!fs.existsSync(filePath)) {
                    stats.failed++;
                    console.log(`   ❌ 文件不存在: ${msg.attachment_path}\n`);
                    continue;
                }
                
                // 分析視頻
                const description = await analyzeVideoWithGemini(filePath);
                
                if (!description) {
                    stats.failed++;
                    console.log(`   ❌ 分析失敗\n`);
                    continue;
                }
                
                // 估算成本（基於文件大小）
                const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
                const estimatedDurationSeconds = fileSizeMB * 10;  // 粗略估算
                const cost = (estimatedDurationSeconds / 30) * 0.01;
                stats.actualCost += cost;
                
                console.log(`   💰 預估成本: $${cost.toFixed(4)}`);
                console.log(`   📝 描述: ${description.substring(0, 100)}...`);
                
                // 構建完整內容
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const caption = msg.content ? `\n原始說明: ${msg.content}` : '';
                const fullContent = `${contactName} 在 ${timestamp} 分享的視頻：\n${description}${caption}`;
                
                // 生成 embedding
                const embedding = await generateEmbedding(fullContent);
                
                if (!embedding) {
                    stats.failed++;
                    console.log(`   ❌ Embedding 失敗\n`);
                    continue;
                }
                
                documents.push({
                    content: fullContent,
                    embedding: embedding,
                    session_id: SESSION_ID,
                    source_type: 'video',
                    metadata: {
                        message_id: msg.id || msg.message_id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        attachment_path: msg.attachment_path,
                        timestamp: msg.message_timestamp,
                        message_type: msg.message_type,
                        caption: msg.content || null,
                        ai_description: description,
                        model: 'gemini-1.5-pro'
                    }
                });
                
                stats.success++;
                console.log(`   ✅ 完成\n`);
                
                // 延遲避免 rate limit
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                stats.failed++;
                console.log(`   ❌ 處理失敗: ${error.message}\n`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 處理統計:');
        console.log('='.repeat(80));
        console.log(`總計: ${stats.total}`);
        console.log(`成功: ${stats.success}`);
        console.log(`失敗: ${stats.failed}`);
        console.log(`預估成本: $${stats.actualCost.toFixed(2)}`);
        console.log('='.repeat(80));
        console.log();

        // 保存到數據庫
        if (documents.length > 0) {
            console.log('步驟 4: 保存到知識庫...\n');
            
            let savedCount = 0;
            for (const doc of documents) {
                try {
                    const { error } = await supabase
                        .from('rag_knowledge')
                        .insert(doc);
                    
                    if (error) throw error;
                    savedCount++;
                    
                    if (savedCount % 5 === 0) {
                        console.log(`   已保存 ${savedCount}/${documents.length}...`);
                    }
                } catch (error) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
            
            console.log(`\n✅ 保存完成！共保存 ${savedCount} 個文檔\n`);
        }
        
        console.log('='.repeat(80));
        console.log('🎉 視頻處理完成！');
        console.log('='.repeat(80));
        console.log(`✅ 已處理 ${stats.success} 個視頻`);
        console.log(`❌ 失敗 ${stats.failed} 個`);
        console.log(`💰 總成本: $${stats.actualCost.toFixed(2)}`);
        console.log('💡 現在可以使用語義搜索查詢視頻內容');
        console.log('='.repeat(80));

        if (allVideoMessages.length > PROCESS_LIMIT) {
            console.log(`\n⚠️  還有 ${allVideoMessages.length - PROCESS_LIMIT} 個視頻未處理`);
            console.log(`   運行: node process-video-gemini.js ${allVideoMessages.length}`);
        }

    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

// 檢查環境變數
if (!GEMINI_API_KEY) {
    console.error('❌ 錯誤: 缺少 GOOGLE_GEMINI_API_KEY 環境變數');
    console.log('請在 .env 文件中添加: GOOGLE_GEMINI_API_KEY=你的API密鑰');
    console.log('獲取方式: https://makersuite.google.com/app/apikey');
    process.exit(1);
}

if (!JINA_API_KEY) {
    console.error('❌ 錯誤: 缺少 JINA_API_KEY 環境變數');
    process.exit(1);
}

console.log('💡 提示: 可以指定處理數量，例如: node process-video-gemini.js 10\n');
processVideoMessages();
