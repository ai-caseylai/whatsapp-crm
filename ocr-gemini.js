// OCR 功能 - 使用 Gemini Vision 提取圖片中的文字
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 配置
const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

// 檢查 API Key
if (!GOOGLE_GEMINI_API_KEY) {
    console.error('❌ 錯誤: 缺少 GOOGLE_GEMINI_API_KEY');
    console.log('請在 .env 文件中添加: GOOGLE_GEMINI_API_KEY=你的密鑰');
    console.log('獲取方式: https://makersuite.google.com/app/apikey');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// OCR 提示詞模板
const OCR_PROMPTS = {
    // 通用 OCR - 提取所有文字
    general: `請仔細查看圖片，提取其中的所有文字內容。

要求：
1. 保持原始排版和格式
2. 如果有多欄，按從左到右、從上到下的順序
3. 如果有表格，用 Markdown 表格格式輸出
4. 保留所有標點符號和換行
5. 如果圖片中沒有文字，只回答「無文字內容」

請直接輸出文字內容，不要加任何解釋或說明。`,

    // 名片識別
    businessCard: `請識別這張名片並提取以下信息，以 JSON 格式輸出：

{
  "name": "姓名",
  "company": "公司名稱",
  "title": "職位",
  "phone": "電話號碼",
  "email": "電子郵件",
  "address": "地址",
  "website": "網站",
  "wechat": "微信號",
  "other": "其他信息"
}

注意：
- 如果某項信息不存在，請填寫 null
- 請只輸出 JSON，不要加其他內容
- 電話號碼保持原格式`,

    // 文檔提取（保留結構）
    document: `請提取文檔中的所有文字，並用 Markdown 格式保持原有結構：

1. 標題使用 # ## ### 等格式
2. 列表使用 - 或 1. 2. 格式
3. 表格使用 Markdown 表格語法
4. 保留段落換行
5. 重要內容用 **粗體** 標註

請直接輸出提取的內容，保持原文排版。`,

    // 收據/發票
    receipt: `請識別這張收據/發票並提取關鍵信息，以 JSON 格式輸出：

{
  "merchant": "商家名稱",
  "date": "日期（YYYY-MM-DD）",
  "total": "總金額（數字）",
  "currency": "幣種",
  "items": [
    {"name": "項目名稱", "price": "價格"}
  ],
  "payment_method": "付款方式",
  "receipt_number": "收據編號"
}

請只輸出 JSON，不要加其他內容。`,

    // 截圖文字提取
    screenshot: `這是一張截圖，請提取其中的所有文字內容。

要求：
1. 按照從上到下、從左到右的順序輸出
2. 保持原始排版（包括換行、縮進）
3. 如果是對話，請用「用戶名: 內容」的格式
4. 如果有按鈕或標題，用 **粗體** 標註

請直接輸出文字，不要加解釋。`
};

// OCR 核心函數
async function performOCR(imagePath, mode = 'general') {
    try {
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.1,  // 降低創造性，提高準確度
                topK: 1,
                topP: 0.8,
            }
        });
        
        // 讀取圖片
        if (!fs.existsSync(imagePath)) {
            throw new Error('圖片文件不存在');
        }
        
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString('base64');
        
        // 判斷 MIME type
        let mimeType = 'image/jpeg';
        const ext = path.extname(imagePath).toLowerCase();
        if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.webp') mimeType = 'image/webp';
        
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType
            }
        };
        
        // 選擇提示詞
        const prompt = OCR_PROMPTS[mode] || OCR_PROMPTS.general;
        
        // 調用 API
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();
        
        return {
            success: true,
            text: text.trim(),
            mode,
            hasText: text.trim() !== '無文字內容' && text.trim() !== ''
        };
        
    } catch (error) {
        console.error('   ❌ OCR 失敗:', error.message);
        return {
            success: false,
            error: error.message,
            hasText: false
        };
    }
}

// 批量處理圖片 OCR
async function processImagesOCR(limit = 10, mode = 'general') {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         🔍 WhatsApp CRM - OCR 批量處理            ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log(`📋 處理模式: ${mode}`);
    console.log(`📊 處理數量: ${limit} 張圖片\n`);
    
    // 獲取需要處理的圖片（排除已經做過 OCR 的）
    const { data: existingOCR } = await supabase
        .from('rag_knowledge')
        .select('source_id')
        .eq('session_id', SESSION_ID)
        .eq('source_type', 'image_ocr');
    
    const processedIds = existingOCR ? existingOCR.map(r => r.source_id) : [];
    
    let query = supabase
        .from('whatsapp_messages')
        .select('id, message_type, attachment_path, from_name, timestamp')
        .eq('session_id', SESSION_ID)
        .eq('message_type', 'imageMessage')
        .not('attachment_path', 'is', null)
        .order('timestamp', { ascending: true });
    
    if (processedIds.length > 0) {
        query = query.not('id', 'in', `(${processedIds.join(',')})`);
    }
    
    const { data: messages, error } = await query.limit(limit);
    
    if (error) {
        console.error('❌ 查詢失敗:', error);
        return;
    }
    
    if (messages.length === 0) {
        console.log('✅ 所有圖片都已處理過 OCR！');
        return;
    }
    
    console.log(`✅ 找到 ${messages.length} 張待處理圖片`);
    console.log(`ℹ️  已跳過 ${processedIds.length} 張已處理的圖片\n`);
    console.log('─'.repeat(60) + '\n');
    
    let successCount = 0;
    let failCount = 0;
    let noTextCount = 0;
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const progress = `[${i+1}/${messages.length}]`;
        
        console.log(`${progress} 處理中...`);
        console.log(`   📤 來源: ${msg.from_name}`);
        console.log(`   📅 時間: ${new Date(msg.timestamp).toLocaleString('zh-TW')}`);
        
        const imagePath = path.join(MEDIA_DIR, path.basename(msg.attachment_path));
        
        if (!fs.existsSync(imagePath)) {
            console.log('   ⚠️  文件不存在，跳過\n');
            failCount++;
            continue;
        }
        
        // 執行 OCR
        const ocrResult = await performOCR(imagePath, mode);
        
        if (ocrResult.success && ocrResult.hasText) {
            const preview = ocrResult.text.length > 100 
                ? ocrResult.text.substring(0, 100) + '...' 
                : ocrResult.text;
            
            console.log('   ✅ OCR 成功');
            console.log(`   📝 文字預覽: ${preview}\n`);
            
            // 保存到數據庫
            const { error: insertError } = await supabase
                .from('rag_knowledge')
                .insert({
                    session_id: SESSION_ID,
                    source_type: 'image_ocr',
                    source_id: msg.id,
                    content: ocrResult.text,
                    metadata: {
                        original_path: msg.attachment_path,
                        from_name: msg.from_name,
                        timestamp: msg.timestamp,
                        ocr_mode: mode
                    }
                });
            
            if (!insertError) {
                successCount++;
            } else {
                console.log('   ⚠️  保存失敗:', insertError.message, '\n');
                failCount++;
            }
        } else if (ocrResult.success && !ocrResult.hasText) {
            console.log('   ℹ️  圖片中無文字內容\n');
            noTextCount++;
        } else {
            console.log('   ❌ OCR 處理失敗\n');
            failCount++;
        }
        
        // 避免 rate limit (Gemini 免費版: 15 RPM)
        await new Promise(resolve => setTimeout(resolve, 4500));
    }
    
    // 最終統計
    console.log('\n' + '═'.repeat(60));
    console.log('📊 OCR 處理完成統計');
    console.log('═'.repeat(60));
    console.log(`✅ 成功提取: ${successCount} 張`);
    console.log(`ℹ️  無文字: ${noTextCount} 張`);
    console.log(`❌ 處理失敗: ${failCount} 張`);
    console.log(`📈 總計: ${messages.length} 張`);
    console.log('═'.repeat(60) + '\n');
    
    if (successCount > 0) {
        console.log('💡 提示: 現在可以使用向量搜索查找 OCR 提取的文字內容！');
        console.log('   例如: node test-vector-search.js "電話" "地址" "email"');
    }
}

// 單張圖片 OCR 測試
async function testSingleImage(imagePath, mode = 'general') {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║         🔍 單張圖片 OCR 測試                      ║');
    console.log('╚════════════════════════════════════════════════════╝\n');
    
    console.log(`📁 圖片路徑: ${imagePath}`);
    console.log(`📋 處理模式: ${mode}\n`);
    
    if (!fs.existsSync(imagePath)) {
        console.error('❌ 圖片文件不存在！');
        return;
    }
    
    console.log('🔄 處理中...\n');
    
    const result = await performOCR(imagePath, mode);
    
    if (result.success) {
        console.log('✅ OCR 處理成功\n');
        console.log('─'.repeat(60));
        console.log('提取的文字內容：');
        console.log('─'.repeat(60));
        console.log(result.text);
        console.log('─'.repeat(60) + '\n');
        
        console.log(`📊 字符數: ${result.text.length}`);
        console.log(`📝 有文字: ${result.hasText ? '是' : '否'}`);
    } else {
        console.log('❌ OCR 處理失敗');
        console.log(`錯誤: ${result.error}`);
    }
}

// 主程序
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('╔════════════════════════════════════════════════════╗');
        console.log('║         🔍 WhatsApp CRM - OCR 工具                ║');
        console.log('╚════════════════════════════════════════════════════╝\n');
        console.log('用法：\n');
        console.log('1. 測試單張圖片：');
        console.log('   node ocr-gemini.js test <圖片路徑> [模式]\n');
        console.log('2. 批量處理：');
        console.log('   node ocr-gemini.js <數量> [模式]\n');
        console.log('可用模式：');
        console.log('  - general       通用 OCR（默認）');
        console.log('  - businessCard  名片識別');
        console.log('  - document      文檔提取');
        console.log('  - receipt       收據/發票');
        console.log('  - screenshot    截圖文字\n');
        console.log('範例：');
        console.log('  node ocr-gemini.js test data/media/image.jpg');
        console.log('  node ocr-gemini.js test data/media/card.jpg businessCard');
        console.log('  node ocr-gemini.js 50 general');
        console.log('  node ocr-gemini.js 100 document');
        return;
    }
    
    if (args[0] === 'test') {
        // 測試單張圖片
        const imagePath = args[1];
        const mode = args[2] || 'general';
        
        if (!imagePath) {
            console.log('❌ 請提供圖片路徑');
            console.log('用法: node ocr-gemini.js test <圖片路徑> [模式]');
            return;
        }
        
        await testSingleImage(imagePath, mode);
    } else {
        // 批量處理
        const limit = parseInt(args[0]);
        const mode = args[1] || 'general';
        
        if (isNaN(limit) || limit <= 0) {
            console.log('❌ 請提供有效的數量');
            return;
        }
        
        await processImagesOCR(limit, mode);
    }
}

// 執行
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序執行失敗:', error);
        process.exit(1);
    });
}

module.exports = { performOCR, processImagesOCR, testSingleImage };
