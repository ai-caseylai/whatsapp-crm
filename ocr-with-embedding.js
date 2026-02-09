// OCR + 向量化完整流程
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY;
const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const OCR_PROMPT = `請仔細查看圖片，提取其中的所有文字內容。

要求：
1. 保持原始排版和格式
2. 如果有多欄，按從左到右、從上到下的順序
3. 如果有表格，用 Markdown 表格格式輸出
4. 保留所有標點符號和換行
5. 如果圖片中沒有文字，只回答「無文字內容」

請直接輸出文字內容，不要加任何解釋或說明。`;

// OCR 函數
async function performOCR(imagePath) {
    try {
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString('base64');
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'WhatsApp CRM OCR'
            },
            body: JSON.stringify({
                model: 'qwen/qwen-vl-max',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: OCR_PROMPT },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` }}
                    ]
                }],
                temperature: 0.1,
                max_tokens: 2000
            })
        });
        
        if (!response.ok) {
            throw new Error(`API 錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        const text = data.choices[0].message.content.trim();
        
        return {
            success: true,
            text,
            hasText: text !== '無文字內容' && text !== '' && !text.includes('沒有文字')
        };
    } catch (error) {
        return { success: false, error: error.message, hasText: false };
    }
}

// 向量化函數
async function generateEmbedding(text) {
    try {
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JINA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'jina-embeddings-v3',
                task: 'retrieval.passage',
                dimensions: 768,  // 改為 768 維以匹配數據庫
                late_chunking: false,
                embedding_type: 'float',
                input: [text]
            })
        });
        
        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${response.status}`);
        }
        
        const data = await response.json();
        return data.data[0].embedding;
    } catch (error) {
        console.error('   ⚠️ 向量化失敗:', error.message);
        return null;
    }
}

async function main() {
    const limit = parseInt(process.argv[2]) || 20;
    
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║    🔍 OCR + 向量化完整流程                        ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    // 讀取圖片文件
    const files = fs.readdirSync(MEDIA_DIR)
        .filter(f => f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg'))
        .slice(0, limit);
    
    console.log(`📁 找到 ${files.length} 張圖片\n`);
    console.log('開始處理...\n');
    
    let successCount = 0;
    let noTextCount = 0;
    let failCount = 0;
    let embeddingFailCount = 0;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const imagePath = path.join(MEDIA_DIR, file);
        
        console.log(`[${i+1}/${files.length}] ${file}`);
        
        // 步驟 1: OCR
        const ocrResult = await performOCR(imagePath);
        
        if (ocrResult.success && ocrResult.hasText) {
            const preview = ocrResult.text.substring(0, 60);
            console.log(`   ✅ OCR 成功: ${preview}...`);
            
            // 步驟 2: 向量化
            console.log(`   🔄 向量化中...`);
            const embedding = await generateEmbedding(ocrResult.text);
            
            if (embedding) {
                console.log(`   ✅ 向量化成功 (${embedding.length} 維)`);
            } else {
                console.log(`   ⚠️ 向量化失敗，但仍會保存文字`);
                embeddingFailCount++;
            }
            
            // 步驟 3: 保存到數據庫
            const { data, error } = await supabase
                .from('rag_knowledge')
                .insert({
                    session_id: SESSION_ID,
                    source_type: 'image_ocr',
                    content: ocrResult.text,
                    embedding: embedding,
                    metadata: { 
                        file,
                        source_file: file,
                        model: 'qwen-vl-max',
                        has_embedding: !!embedding
                    }
                })
                .select();
            
            if (error) {
                console.log(`   ❌ 保存失敗: ${error.message}\n`);
                failCount++;
            } else {
                console.log(`   ✅ 已保存到數據庫 (ID: ${data[0].id})\n`);
                successCount++;
            }
            
        } else if (ocrResult.success) {
            console.log('   ℹ️  無文字內容\n');
            noTextCount++;
        } else {
            console.log(`   ❌ OCR 失敗: ${ocrResult.error}\n`);
            failCount++;
        }
        
        // 避免 rate limit
        await new Promise(r => setTimeout(r, 1500));
    }
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 處理完成統計');
    console.log('═'.repeat(60));
    console.log(`✅ 成功保存: ${successCount} 條（含向量）`);
    console.log(`⚠️  向量化失敗: ${embeddingFailCount} 條（但文字已保存）`);
    console.log(`ℹ️  無文字: ${noTextCount} 張`);
    console.log(`❌ 失敗: ${failCount} 張`);
    console.log(`📈 總計: ${files.length} 張`);
    console.log(`💰 預估成本: ~$${((files.length * 0.0002) + (successCount * 0.00002)).toFixed(4)}`);
    console.log('═'.repeat(60) + '\n');
    
    if (successCount > 0) {
        console.log('✅ OCR 文字已向量化並保存！');
        console.log('💡 現在可以搜索 OCR 提取的內容：');
        console.log('   node test-vector-search.js "市場快訊"');
        console.log('   node test-vector-search.js "叮叮車仔麵"');
        console.log('   node test-vector-search.js "年糕"');
    }
}

main().catch(console.error);
