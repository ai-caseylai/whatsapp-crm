// 使用 Google Gemini API 處理圖片（免費額度）
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 檢查環境變數
if (!GOOGLE_GEMINI_API_KEY) {
    console.error('❌ 錯誤: 缺少 GOOGLE_GEMINI_API_KEY 環境變數');
    console.log('\n請在 .env 文件中添加:');
    console.log('GOOGLE_GEMINI_API_KEY=你的API密鑰');
    console.log('\n獲取方式: https://makersuite.google.com/app/apikey');
    console.log('✅ 每月有免費額度（足夠處理所有圖片）');
    process.exit(1);
}

if (!JINA_API_KEY) {
    console.error('❌ 錯誤: 缺少 JINA_API_KEY 環境變數');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);

// 使用 Gemini 分析圖片
async function analyzeImageWithGemini(filePath) {
    try {
        const imageData = fs.readFileSync(filePath);
        const base64Image = imageData.toString('base64');
        
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        const mimeType = mimeTypes[ext] || 'image/jpeg';
        
        // 使用 Gemini 1.5 Flash（免費且快速）
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent([
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Image
                }
            },
            '請用繁體中文詳細描述這張圖片的內容，包括：場景、人物、物品、活動、文字等。'
        ]);
        
        const response = await result.response;
        return response.text();
        
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
async function processImages() {
    console.log('='.repeat(80));
    console.log('🖼️  圖片處理（使用 Google Gemini - 免費）');
    console.log('='.repeat(80));
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`🤖 模型: Gemini 1.5 Flash`);
    console.log(`💰 成本: 免費（每月有額度限制）`);
    console.log('='.repeat(80));
    console.log();

    try {
        // 獲取所有圖片消息
        console.log('步驟 1: 查找圖片消息...\n');
        
        let allImageMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .eq('message_type', 'imageMessage')
                .not('attachment_path', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allImageMessages = allImageMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allImageMessages.length} 張圖片\n`);
        
        if (allImageMessages.length === 0) {
            console.log('⚠️  沒有找到圖片消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allImageMessages.map(m => m.remote_jid))];
        
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
        const PROCESS_LIMIT = parseInt(process.argv[2]) || 100;
        const messagesToProcess = allImageMessages.slice(0, PROCESS_LIMIT);
        
        console.log(`步驟 3: 處理圖片（前 ${messagesToProcess.length} 張）...\n`);

        const documents = [];
        const stats = {
            total: messagesToProcess.length,
            success: 0,
            failed: 0
        };

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            
            console.log(`[${i + 1}/${messagesToProcess.length}] 🖼️  處理圖片...`);
            console.log(`   來源: ${contactName}`);
            
            try {
                const filePath = path.join(MEDIA_DIR, msg.attachment_path);
                
                if (!fs.existsSync(filePath)) {
                    stats.failed++;
                    console.log(`   ❌ 文件不存在: ${msg.attachment_path}\n`);
                    continue;
                }
                
                // 分析圖片
                const description = await analyzeImageWithGemini(filePath);
                
                if (!description) {
                    stats.failed++;
                    console.log(`   ❌ 分析失敗\n`);
                    continue;
                }
                
                console.log(`   ✅ 描述: ${description.substring(0, 80)}...`);
                
                // 構建完整內容
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const caption = msg.content ? `\n原始說明: ${msg.content}` : '';
                const fullContent = `${contactName} 在 ${timestamp} 分享的圖片：\n${description}${caption}`;
                
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
                    source_type: 'image',
                    metadata: {
                        message_id: msg.id || msg.message_id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        attachment_path: msg.attachment_path,
                        timestamp: msg.message_timestamp,
                        message_type: msg.message_type,
                        caption: msg.content || null,
                        ai_description: description,
                        model: 'gemini-1.5-flash'
                    }
                });
                
                stats.success++;
                console.log(`   ✅ 完成\n`);
                
                // 延遲避免 rate limit（Gemini 免費版限制較嚴）
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
                    
                    if (savedCount % 20 === 0) {
                        console.log(`   已保存 ${savedCount}/${documents.length}...`);
                    }
                } catch (error) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
            
            console.log(`\n✅ 保存完成！共保存 ${savedCount} 個文檔\n`);
        }
        
        console.log('='.repeat(80));
        console.log('🎉 圖片處理完成！');
        console.log('='.repeat(80));
        console.log(`✅ 已處理 ${stats.success} 張圖片`);
        console.log(`❌ 失敗 ${stats.failed} 張`);
        console.log(`💰 總成本: $0.00（使用免費額度）`);
        console.log('💡 現在可以使用語義搜索查詢圖片內容');
        console.log('='.repeat(80));

        if (allImageMessages.length > PROCESS_LIMIT) {
            console.log(`\n⚠️  還有 ${allImageMessages.length - PROCESS_LIMIT} 張圖片未處理`);
            console.log(`   運行: node process-images-gemini.js ${allImageMessages.length}`);
        }

    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

console.log('💡 提示: 可以指定處理數量，例如: node process-images-gemini.js 50\n');
processImages();
