// 處理所有類型的多媒體附件：圖片、視頻、PDF、文檔、音頻等
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Vision 模型配置（用於圖片和視頻）
// 注意：免費模型可能會過期，如果出現 404 錯誤，請更換模型
const VISION_MODELS = {
    // 推薦選項（按成本排序）
    'qwen-vl-max': 'qwen/qwen-vl-max',                    // $0.0002/張 - 便宜且快速
    'claude-haiku': 'anthropic/claude-3.5-haiku',         // $0.001/張 - 快速且高質量
    'gemini-flash': 'google/gemini-flash-1.5-8b',         // $0.00125/張 - Google 官方
    'claude-sonnet': 'anthropic/claude-3.5-sonnet',       // $0.015/張 - 最高質量
};

// 選擇模型（可通過環境變數覆蓋）
const VISION_MODEL = process.env.VISION_MODEL || VISION_MODELS['qwen-vl-max'];

// 消息類型映射
const MESSAGE_TYPES = {
    image: {
        types: ['imageMessage'],
        needsVision: true,
        icon: '🖼️',
        prompt: '請用繁體中文詳細描述這張圖片的內容，包括：場景、人物、物品、活動、文字等。'
    },
    video: {
        types: ['videoMessage'],
        needsVision: true,
        icon: '🎬',
        prompt: '請用繁體中文描述這個視頻的內容，包括：場景、人物、活動、主要內容等。如果是視頻截圖，請描述截圖內容。'
    },
    document: {
        types: ['documentMessage'],
        needsVision: false,
        icon: '📄',
        prompt: null // 文檔使用文件名和說明
    },
    audio: {
        types: ['audioMessage'], // ptt = push-to-talk (語音消息)
        needsVision: false,
        icon: '🎵',
        prompt: null
    }
};

// 使用 Vision API 分析圖片/視頻
async function analyzeMediaWithVision(filePath, mediaType) {
    try {
        const config = MESSAGE_TYPES[mediaType];
        const prompt = config.prompt;
        
        // 读取文件并转为 base64
        const fileBuffer = fs.readFileSync(filePath);
        const base64Data = fileBuffer.toString('base64');
        const ext = path.extname(filePath).toLowerCase();
        
        // 确定 MIME 类型
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo'
        };
        const mimeType = mimeTypes[ext] || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64Data}`;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'WhatsApp CRM Media Analysis'
            },
            body: JSON.stringify({
                model: VISION_MODEL,
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: dataUrl } }
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
        console.error('   Vision 分析失敗:', error.message);
        return null;
    }
}

// 生成文檔描述（基於文件名和說明）
function generateDocumentDescription(msg) {
    const parts = [];
    
    // 文件名
    if (msg.content) {
        parts.push(`文件名: ${msg.content}`);
    }
    
    // 文件類型
    const ext = msg.media_url ? msg.media_url.split('.').pop().toLowerCase() : 'unknown';
    const fileTypes = {
        'pdf': 'PDF 文檔',
        'doc': 'Word 文檔',
        'docx': 'Word 文檔',
        'xls': 'Excel 表格',
        'xlsx': 'Excel 表格',
        'ppt': 'PowerPoint 簡報',
        'pptx': 'PowerPoint 簡報',
        'txt': '文字檔案',
        'csv': 'CSV 數據表'
    };
    
    if (fileTypes[ext]) {
        parts.push(`類型: ${fileTypes[ext]}`);
    }
    
    return parts.join('\n');
}

// 生成音頻描述
function generateAudioDescription(msg) {
    const isPTT = msg.message_type === 'ptt';
    const type = isPTT ? '語音訊息' : '音頻檔案';
    
    const parts = [`類型: ${type}`];
    
    if (msg.content) {
        parts.push(`說明: ${msg.content}`);
    }
    
    // 如果有時長信息
    if (msg.metadata && msg.metadata.duration) {
        parts.push(`時長: ${msg.metadata.duration} 秒`);
    }
    
    return parts.join('\n');
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
async function processAllMediaMessages() {
    console.log('='.repeat(80));
    console.log('📎 多媒體附件處理與向量化');
    console.log('='.repeat(80));
    console.log(`🤖 Vision 模型: ${VISION_MODEL}`);
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log('='.repeat(80));
    console.log();

    try {
        // 獲取所有附件類型的消息
        console.log('步驟 1: 查找所有附件消息...\n');
        
        const allTypes = Object.values(MESSAGE_TYPES).flatMap(t => t.types);
        
        let allMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .in('message_type', allTypes)
                .not('attachment_path', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allMessages = allMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        // 按類型分組統計
        const stats = {};
        allMessages.forEach(msg => {
            const type = msg.message_type;
            stats[type] = (stats[type] || 0) + 1;
        });
        
        console.log('✅ 找到的附件統計:');
        Object.entries(stats).forEach(([type, count]) => {
            const config = Object.values(MESSAGE_TYPES).find(t => t.types.includes(type));
            const icon = config ? config.icon : '📎';
            console.log(`   ${icon} ${type}: ${count} 個`);
        });
        console.log(`   總計: ${allMessages.length} 個附件\n`);

        if (allMessages.length === 0) {
            console.log('⚠️  沒有找到附件消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allMessages.map(m => m.remote_jid))];
        
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

        // 處理限制（可調整）
        const PROCESS_LIMIT = parseInt(process.argv[2]) || 100;
        const messagesToProcess = allMessages.slice(0, PROCESS_LIMIT);
        
        console.log(`步驟 3: 處理附件（前 ${messagesToProcess.length} 個）...\n`);

        const documents = [];
        const stats2 = {
            total: messagesToProcess.length,
            success: 0,
            failed: 0,
            byType: {}
        };

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            const msgType = msg.message_type;
            
            // 找到對應的配置
            let config = null;
            let category = null;
            for (const [cat, cfg] of Object.entries(MESSAGE_TYPES)) {
                if (cfg.types.includes(msgType)) {
                    config = cfg;
                    category = cat;
                    break;
                }
            }
            
            if (!config) {
                console.log(`[${i + 1}/${messagesToProcess.length}] ⚠️  未知類型: ${msgType}`);
                stats2.failed++;
                continue;
            }
            
            console.log(`[${i + 1}/${messagesToProcess.length}] ${config.icon} 處理 ${category}...`);
            console.log(`   來源: ${contactName}`);
            
            try {
                let description = '';
                
                // 获取文件路径
                const filePath = path.join(MEDIA_DIR, msg.attachment_path);
                
                // 检查文件是否存在
                if (!fs.existsSync(filePath)) {
                    stats2.failed++;
                    console.log(`   ❌ 文件不存在: ${msg.attachment_path}\n`);
                    continue;
                }
                
                // 根據類型生成描述
                if (config.needsVision) {
                    // 圖片和視頻需要 Vision API
                    description = await analyzeMediaWithVision(filePath, category);
                    if (!description) {
                        stats2.failed++;
                        console.log(`   ❌ Vision 分析失敗\n`);
                        continue;
                    }
                } else if (category === 'document') {
                    description = generateDocumentDescription(msg);
                } else if (category === 'audio') {
                    description = generateAudioDescription(msg);
                }
                
                console.log(`   ✅ 描述: ${description.substring(0, 80)}...`);
                
                // 構建完整內容
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const typeLabel = {
                    'image': '圖片',
                    'video': '視頻',
                    'document': '文檔',
                    'audio': '音頻'
                }[category] || '附件';
                
                const caption = msg.content ? `\n原始說明: ${msg.content}` : '';
                const fullContent = `${contactName} 在 ${timestamp} 分享的${typeLabel}：\n${description}${caption}`;
                
                // 生成 embedding
                const embedding = await generateEmbedding(fullContent);
                
                if (!embedding) {
                    stats2.failed++;
                    console.log(`   ❌ Embedding 失敗\n`);
                    continue;
                }
                
                documents.push({
                    content: fullContent,
                    embedding: embedding,
                    session_id: SESSION_ID,
                    source_type: category,
                    metadata: {
                        message_id: msg.id || msg.message_id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        attachment_path: msg.attachment_path,
                        timestamp: msg.message_timestamp,
                        message_type: msgType,
                        caption: msg.content || null,
                        ai_description: description,
                        model: config.needsVision ? VISION_MODEL : 'text-only'
                    }
                });
                
                stats2.success++;
                stats2.byType[category] = (stats2.byType[category] || 0) + 1;
                console.log(`   ✅ 完成\n`);
                
                // 延遲避免 rate limit
                if (config.needsVision) {
                    await new Promise(resolve => setTimeout(resolve, 1500));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                
            } catch (error) {
                stats2.failed++;
                console.log(`   ❌ 處理失敗: ${error.message}\n`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 處理統計:');
        console.log('='.repeat(80));
        console.log(`總計: ${stats2.total}`);
        console.log(`成功: ${stats2.success}`);
        console.log(`失敗: ${stats2.failed}`);
        console.log('\n按類型統計:');
        Object.entries(stats2.byType).forEach(([type, count]) => {
            const config = MESSAGE_TYPES[type];
            console.log(`   ${config.icon} ${type}: ${count}`);
        });
        console.log('='.repeat(80));
        console.log();

        // 步驟 4: 保存到數據庫
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
        console.log('🎉 多媒體附件處理完成！');
        console.log('='.repeat(80));
        console.log(`✅ 已向量化 ${stats2.success} 個附件`);
        console.log(`❌ 失敗 ${stats2.failed} 個`);
        console.log('💡 現在可以使用語義搜索查詢所有附件內容');
        console.log('='.repeat(80));

        if (allMessages.length > PROCESS_LIMIT) {
            console.log(`\n⚠️  還有 ${allMessages.length - PROCESS_LIMIT} 個附件未處理`);
            console.log(`   運行: node process-all-media.js ${allMessages.length}`);
        }

    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

// 檢查環境變數
if (!OPENROUTER_API_KEY) {
    console.error('❌ 錯誤: 缺少 OPENROUTER_API_KEY 或 GEMINI_API_KEY 環境變數');
    console.log('請在 .env 文件中添加: OPENROUTER_API_KEY=你的API密鑰');
    console.log('或使用: GEMINI_API_KEY=你的API密鑰');
    process.exit(1);
}

if (!JINA_API_KEY) {
    console.error('❌ 錯誤: 缺少 JINA_API_KEY 環境變數');
    process.exit(1);
}

console.log('提示: 可以指定處理數量，例如: node process-all-media.js 50\n');
processAllMediaMessages();
