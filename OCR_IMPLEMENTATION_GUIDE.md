# 📷 OCR 功能實現指南

## 🎯 OCR 功能概述

OCR（Optical Character Recognition，光學字符識別）可以從圖片中提取文字內容，對於您的 WhatsApp CRM 系統特別有用：

- ✅ 提取名片信息
- ✅ 識別文檔、收據、發票
- ✅ 讀取截圖中的文字
- ✅ 提取聊天記錄圖片中的內容

---

## 🚀 推薦方案對比

### 方案 1：Google Gemini Vision（推薦 ⭐⭐⭐⭐⭐）

**優點**：
- ✅ **您已經在使用** - 無需額外配置
- ✅ **免費額度大** - 每月 1500 次請求
- ✅ **多語言支持** - 中文、英文等
- ✅ **智能理解** - 不僅提取文字，還能理解上下文
- ✅ **質量極高** - 手寫字體、複雜排版都能識別

**成本**：
- 免費額度內：$0
- 超出後：約 $0.001/張圖片

**適用場景**：
- ✅ 複雜文檔（多欄位、表格）
- ✅ 手寫文字
- ✅ 混合中英文
- ✅ 需要理解文字含義

---

### 方案 2：Tesseract OCR（免費開源）

**優點**：
- ✅ **完全免費** - 本地運行
- ✅ **無 API 限制**
- ✅ **隱私保護** - 數據不上傳
- ✅ **支持多語言**

**缺點**：
- ⚠️ 需要安裝系統依賴
- ⚠️ 對模糊圖片效果較差
- ⚠️ 手寫字識別不佳

**成本**：完全免費

**適用場景**：
- ✅ 清晰的打印文檔
- ✅ 大批量處理
- ✅ 隱私敏感數據

---

### 方案 3：GPT-4 Vision（OpenRouter）

**優點**：
- ✅ 識別準確率高
- ✅ 可以理解複雜排版
- ✅ 您已配置 OpenRouter

**缺點**：
- ⚠️ 成本較高（$0.003-$0.01/張）

**成本**：約 $0.005/張圖片

---

### 方案 4：專業 OCR API

#### Azure Computer Vision OCR
- **優點**：企業級、準確度高、支持表格識別
- **成本**：$1/1000 次

#### AWS Textract
- **優點**：可識別表格、表單結構
- **成本**：$1.5/1000 頁

---

## 🎯 我的推薦

### 最佳方案：**Gemini Vision OCR**

您已經有 Gemini API，直接使用就能獲得最佳效果！我會為您創建實現腳本。

---

## 💻 實現代碼

### 1. 使用 Gemini Vision 實現 OCR

```javascript
// ocr-gemini.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 配置
const GOOGLE_GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'your-service-key';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const genAI = new GoogleGenerativeAI(GOOGLE_GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// OCR 提示詞（可根據需求調整）
const OCR_PROMPTS = {
    // 通用 OCR - 提取所有文字
    general: `請提取圖片中的所有文字內容。
要求：
1. 保持原始排版和格式
2. 如果有多欄，按從左到右、從上到下的順序
3. 如果有表格，用 Markdown 表格格式輸出
4. 保留所有標點符號
5. 如果圖片中沒有文字，回答「無文字內容」

請直接輸出文字內容，不要加任何解釋。`,

    // 名片識別
    businessCard: `請識別這張名片並提取以下信息（JSON 格式）：
{
  "name": "姓名",
  "company": "公司名稱",
  "title": "職位",
  "phone": "電話號碼",
  "email": "電子郵件",
  "address": "地址",
  "website": "網站",
  "other": "其他信息"
}

如果某項信息不存在，請填寫 null。`,

    // 文檔提取（保留結構）
    document: `請提取文檔中的所有文字，並保持原有結構：
1. 標題使用 Markdown # 格式
2. 列表使用 - 或數字格式
3. 表格使用 Markdown 表格
4. 保留段落換行

請直接輸出提取的內容。`,

    // 收據/發票
    receipt: `請識別這張收據/發票並提取關鍵信息（JSON 格式）：
{
  "merchant": "商家名稱",
  "date": "日期",
  "total": "總金額",
  "items": ["項目1", "項目2", ...],
  "payment_method": "付款方式",
  "receipt_number": "收據編號"
}`,

    // 截圖文字提取
    screenshot: `這是一張截圖，請提取其中的所有文字內容。
按照從上到下的順序輸出，保持原始排版。
如果有對話，請標注說話者。`
};

// OCR 函數
async function performOCR(imagePath, mode = 'general') {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        
        // 讀取圖片
        const imageData = fs.readFileSync(imagePath);
        const base64Image = imageData.toString('base64');
        
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: 'image/jpeg'
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
            mode
        };
        
    } catch (error) {
        console.error('OCR 失敗:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// 批量處理圖片 OCR
async function processImagesOCR(limit = 10, mode = 'general') {
    console.log('🔍 開始 OCR 處理...\n');
    console.log(`模式: ${mode}`);
    console.log(`處理數量: ${limit}\n`);
    
    // 獲取需要處理的圖片
    const { data: messages, error } = await supabase
        .from('whatsapp_messages')
        .select('id, message_type, attachment_path, from_name')
        .eq('session_id', SESSION_ID)
        .eq('message_type', 'imageMessage')
        .not('attachment_path', 'is', null)
        .limit(limit);
    
    if (error) {
        console.error('❌ 查詢失敗:', error);
        return;
    }
    
    console.log(`找到 ${messages.length} 張圖片待處理\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        console.log(`\n[${i+1}/${messages.length}] 處理圖片...`);
        console.log(`來源: ${msg.from_name}`);
        
        const imagePath = path.join(MEDIA_DIR, path.basename(msg.attachment_path));
        
        if (!fs.existsSync(imagePath)) {
            console.log('⚠️ 文件不存在，跳過');
            failCount++;
            continue;
        }
        
        // 執行 OCR
        const ocrResult = await performOCR(imagePath, mode);
        
        if (ocrResult.success && ocrResult.text !== '無文字內容') {
            console.log('✅ OCR 成功');
            console.log(`文字內容:\n${ocrResult.text.substring(0, 200)}${ocrResult.text.length > 200 ? '...' : ''}\n`);
            
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
                        ocr_mode: mode
                    }
                });
            
            if (!insertError) {
                successCount++;
            } else {
                console.log('⚠️ 保存失敗:', insertError.message);
                failCount++;
            }
        } else {
            console.log('ℹ️ 無文字內容或處理失敗');
            failCount++;
        }
        
        // 避免 rate limit
        await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 OCR 處理完成');
    console.log('='.repeat(50));
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失敗/無文字: ${failCount}`);
    console.log(`📈 總計: ${messages.length}`);
}

// 單張圖片 OCR 測試
async function testSingleImage(imagePath, mode = 'general') {
    console.log('🔍 測試單張圖片 OCR\n');
    console.log(`圖片: ${imagePath}`);
    console.log(`模式: ${mode}\n`);
    
    const result = await performOCR(imagePath, mode);
    
    if (result.success) {
        console.log('✅ OCR 成功\n');
        console.log('提取的文字：');
        console.log('─'.repeat(50));
        console.log(result.text);
        console.log('─'.repeat(50));
    } else {
        console.log('❌ OCR 失敗:', result.error);
    }
}

// 主程序
async function main() {
    const args = process.argv.slice(2);
    
    if (args[0] === 'test') {
        // 測試單張圖片
        const imagePath = args[1];
        const mode = args[2] || 'general';
        if (!imagePath) {
            console.log('用法: node ocr-gemini.js test <圖片路徑> [模式]');
            return;
        }
        await testSingleImage(imagePath, mode);
    } else {
        // 批量處理
        const limit = parseInt(args[0]) || 10;
        const mode = args[1] || 'general';
        await processImagesOCR(limit, mode);
    }
}

main().catch(console.error);
```

---

## 🎯 使用方法

### 1. 安裝依賴

```bash
npm install @google/generative-ai
```

### 2. 配置環境變數

在 `.env` 文件中添加：

```bash
GOOGLE_GEMINI_API_KEY=你的_Gemini_API_密鑰
```

### 3. 運行 OCR

#### 測試單張圖片

```bash
# 通用 OCR
node ocr-gemini.js test data/media/圖片名.jpg

# 名片識別
node ocr-gemini.js test data/media/名片.jpg businessCard

# 文檔提取
node ocr-gemini.js test data/media/文檔.jpg document

# 收據識別
node ocr-gemini.js test data/media/收據.jpg receipt
```

#### 批量處理

```bash
# 處理 50 張圖片（通用 OCR）
node ocr-gemini.js 50

# 處理 100 張圖片（文檔模式）
node ocr-gemini.js 100 document

# 處理所有圖片
node ocr-gemini.js 1718
```

---

## 📊 OCR 結果存儲

OCR 提取的文字會保存到 `rag_knowledge` 表：

```javascript
{
  session_id: 'sess_id73sa6oi_1770363274857',
  source_type: 'image_ocr',
  source_id: '原始消息 ID',
  content: '提取的文字內容',
  metadata: {
    original_path: '原始圖片路徑',
    from_name: '發送者',
    ocr_mode: 'general'
  }
}
```

之後可以通過向量搜索找到這些文字內容！

---

## 🔍 搜索 OCR 內容

OCR 處理後，您可以搜索圖片中的文字：

```javascript
// 使用現有的搜索腳本
node test-vector-search.js "發票"
node test-vector-search.js "電話號碼"
node test-vector-search.js "地址"
```

---

## 💡 進階功能

### 1. 自動判斷 OCR 模式

可以讓 AI 先判斷圖片類型，再選擇合適的 OCR 模式：

```javascript
async function smartOCR(imagePath) {
    // 第一步：判斷圖片類型
    const typeResult = await performOCR(imagePath, 'general');
    
    // 第二步：根據內容選擇模式
    let mode = 'general';
    if (typeResult.text.includes('名片') || typeResult.text.includes('電話')) {
        mode = 'businessCard';
    } else if (typeResult.text.includes('發票') || typeResult.text.includes('總額')) {
        mode = 'receipt';
    }
    
    // 第三步：用專門模式重新處理
    return await performOCR(imagePath, mode);
}
```

### 2. OCR + 翻譯

```javascript
const translatePrompt = `請先提取圖片中的文字，然後翻譯成繁體中文。
格式：
原文：[提取的文字]
翻譯：[翻譯後的內容]`;
```

### 3. OCR + 數據提取

```javascript
const extractPrompt = `請提取圖片中的所有聯繫信息，以 JSON 格式輸出：
{
  "names": ["姓名1", "姓名2"],
  "phones": ["電話1", "電話2"],
  "emails": ["email1", "email2"],
  "addresses": ["地址1", "地址2"]
}`;
```

---

## 🎯 成本估算

### Gemini Vision OCR

- **免費額度**: 1500 次/月
- **超出後**: ~$0.001/張圖片
- **1718 張圖片**: 約 $1.72（超出免費額度部分）

### 實際使用建議

1. **先處理 1500 張**（免費額度內）
2. **下個月再處理剩餘的**（繼續免費）
3. **或者付費處理全部**（總成本 < $2）

---

## ✅ 總結

### 推薦方案：Gemini Vision OCR

- ✅ 您已經有 API Key
- ✅ 質量最好
- ✅ 成本最低
- ✅ 支持多種文檔類型
- ✅ 可以理解上下文

### 立即開始

1. 確保 `.env` 中有 `GOOGLE_GEMINI_API_KEY`
2. 運行我提供的腳本
3. 選擇合適的 OCR 模式
4. 開始提取文字！

需要我為您創建實際的運行腳本嗎？ 🚀
