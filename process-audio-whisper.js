// 使用 OpenAI Whisper 處理音頻（粵語語音轉文字）
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// 使用 Whisper 轉錄音頻
async function transcribeAudio(filePath) {
    try {
        console.log(`   🎤 開始轉錄: ${path.basename(filePath)}`);
        
        // 檢查文件大小（Whisper 限制 25MB）
        const stats = fs.statSync(filePath);
        const fileSizeMB = stats.size / (1024 * 1024);
        
        if (fileSizeMB > 25) {
            console.log(`   ⚠️  文件過大 (${fileSizeMB.toFixed(2)}MB)，需要壓縮`);
            return null;
        }
        
        console.log(`   📊 文件大小: ${fileSizeMB.toFixed(2)}MB`);
        
        // 調用 Whisper API
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "zh",  // 中文（包括粵語）
            response_format: "verbose_json",  // 獲取詳細信息
            timestamp_granularities: ["segment"]
        });
        
        console.log(`   ✅ 轉錄完成，語言: ${transcription.language}`);
        console.log(`   ⏱️  音頻時長: ${transcription.duration?.toFixed(1) || '未知'} 秒`);
        
        return {
            text: transcription.text,
            language: transcription.language,
            duration: transcription.duration,
            segments: transcription.segments
        };
        
    } catch (error) {
        console.log(`   ❌ 轉錄失敗: ${error.message}`);
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
async function processAudioMessages() {
    console.log('='.repeat(80));
    console.log('🎤 音頻轉文字處理（OpenAI Whisper）');
    console.log('='.repeat(80));
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`💰 成本: $0.006/分鐘`);
    console.log('='.repeat(80));
    console.log();

    try {
        // 獲取所有音頻消息
        console.log('步驟 1: 查找音頻消息...\n');
        
        let allAudioMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .in('message_type', ['audioMessage', 'ptt'])
                .not('attachment_path', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allAudioMessages = allAudioMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allAudioMessages.length} 個音頻文件\n`);
        
        if (allAudioMessages.length === 0) {
            console.log('⚠️  沒有找到音頻消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allAudioMessages.map(m => m.remote_jid))];
        
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
        const PROCESS_LIMIT = parseInt(process.argv[2]) || 50;
        const messagesToProcess = allAudioMessages.slice(0, PROCESS_LIMIT);
        
        // 估算成本
        const avgDurationMinutes = 1;  // 假設平均 1 分鐘
        const estimatedCost = messagesToProcess.length * avgDurationMinutes * 0.006;
        
        console.log(`步驟 3: 處理音頻（前 ${messagesToProcess.length} 個）...`);
        console.log(`💰 預估成本: $${estimatedCost.toFixed(2)}\n`);

        const documents = [];
        const stats = {
            total: messagesToProcess.length,
            success: 0,
            failed: 0,
            totalDuration: 0,
            actualCost: 0
        };

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            const isPTT = msg.message_type === 'audioMessage' || msg.message_type === 'ptt';
            const typeLabel = isPTT ? '🎙️ 語音訊息' : '🎵 音頻檔案';
            
            console.log(`[${i + 1}/${messagesToProcess.length}] ${typeLabel}`);
            console.log(`   來源: ${contactName}`);
            
            try {
                const filePath = path.join(MEDIA_DIR, msg.attachment_path);
                
                if (!fs.existsSync(filePath)) {
                    stats.failed++;
                    console.log(`   ❌ 文件不存在: ${msg.attachment_path}\n`);
                    continue;
                }
                
                // 轉錄音頻
                const transcription = await transcribeAudio(filePath);
                
                if (!transcription || !transcription.text) {
                    stats.failed++;
                    console.log(`   ❌ 轉錄失敗\n`);
                    continue;
                }
                
                // 計算成本
                const durationMinutes = (transcription.duration || 60) / 60;
                const cost = durationMinutes * 0.006;
                stats.actualCost += cost;
                stats.totalDuration += transcription.duration || 0;
                
                console.log(`   💰 成本: $${cost.toFixed(4)}`);
                console.log(`   📝 轉錄: ${transcription.text.substring(0, 100)}...`);
                
                // 構建完整內容
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const fullContent = `${contactName} 在 ${timestamp} 發送的${isPTT ? '語音訊息' : '音頻'}：\n${transcription.text}`;
                
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
                    source_type: 'audio',
                    metadata: {
                        message_id: msg.id || msg.message_id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        attachment_path: msg.attachment_path,
                        timestamp: msg.message_timestamp,
                        message_type: msg.message_type,
                        transcription: transcription.text,
                        language: transcription.language,
                        duration: transcription.duration,
                        model: 'whisper-1'
                    }
                });
                
                stats.success++;
                console.log(`   ✅ 完成\n`);
                
                // 延遲避免 rate limit
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                stats.failed++;
                console.log(`   ❌ 處理失敗: ${error.message}\n`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 處理統計:');
        console.log('='.repeat(80));
        console.log(`總計: ${stats.total}`);
        console.log(`成功: ${stats.success}`);
        console.log(`失敗: ${stats.failed}`);
        console.log(`總時長: ${(stats.totalDuration / 60).toFixed(1)} 分鐘`);
        console.log(`實際成本: $${stats.actualCost.toFixed(2)}`);
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
                    
                    if (savedCount % 10 === 0) {
                        console.log(`   已保存 ${savedCount}/${documents.length}...`);
                    }
                } catch (error) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
            
            console.log(`\n✅ 保存完成！共保存 ${savedCount} 個文檔\n`);
        }
        
        console.log('='.repeat(80));
        console.log('🎉 音頻處理完成！');
        console.log('='.repeat(80));
        console.log(`✅ 已轉錄 ${stats.success} 個音頻`);
        console.log(`❌ 失敗 ${stats.failed} 個`);
        console.log(`💰 總成本: $${stats.actualCost.toFixed(2)}`);
        console.log('💡 現在可以使用語義搜索查詢音頻內容');
        console.log('='.repeat(80));

        if (allAudioMessages.length > PROCESS_LIMIT) {
            console.log(`\n⚠️  還有 ${allAudioMessages.length - PROCESS_LIMIT} 個音頻未處理`);
            console.log(`   運行: node process-audio-whisper.js ${allAudioMessages.length}`);
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

if (!JINA_API_KEY) {
    console.error('❌ 錯誤: 缺少 JINA_API_KEY 環境變數');
    process.exit(1);
}

console.log('💡 提示: 可以指定處理數量，例如: node process-audio-whisper.js 20\n');
processAudioMessages();
