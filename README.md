# WhatsApp CRM 系統 - 完整文檔

> 基於 AI 的 WhatsApp 消息管理與智能檢索系統

## 📋 目錄

- [系統概述](#系統概述)
- [核心功能](#核心功能)
- [技術架構](#技術架構)
- [快速開始](#快速開始)
- [使用指南](#使用指南)
- [開發文檔](#開發文檔)
- [API 參考](#api-參考)
- [故障排除](#故障排除)
- [成本分析](#成本分析)

---

## 系統概述

### 🎯 項目簡介

WhatsApp CRM 是一個智能化的消息管理系統，能夠：
- 從 WhatsApp 導出的聊天記錄中提取並分析多媒體內容
- 使用 AI 自動生成圖片、視頻、音頻的文字描述
- 從圖片中提取文字（OCR）
- 處理各類文檔（PDF、Word、Excel）
- 建立向量化知識庫，支持語義搜索
- 提供智能檢索和內容分析功能

### 🏗️ 系統特點

- ✅ **多模態內容處理**：支持圖片、視頻、音頻、文檔
- ✅ **AI 驅動**：使用多個先進 AI 模型
- ✅ **向量搜索**：基於語義的智能檢索
- ✅ **成本優化**：靈活使用免費和付費 API
- ✅ **可擴展性**：模塊化設計，易於擴展
- ✅ **自動化**：批量處理，自動向量化

### 📊 數據統計

當前系統已處理：
- **消息記錄**：數千條
- **圖片描述**：1200+ 條
- **OCR 文字**：正在處理 1488 張
- **音頻轉錄**：363 條
- **文檔內容**：262 條
- **總知識條目**：1800+ 條

---

## 核心功能

### 1. 📱 WhatsApp 數據導入

**功能說明**：
- 從 WhatsApp 導出的 ZIP 文件中提取消息
- 自動識別並分類多媒體文件
- 保存到 Supabase 數據庫

**支持的消息類型**：
- 文字消息
- 圖片消息（imageMessage）
- 視頻消息（videoMessage）
- 音頻消息（audioMessage / ptt）
- 文檔消息（documentMessage）

**使用方法**：
```bash
node import-whatsapp-zip.js <ZIP文件路徑>
```

### 2. 🖼️ 圖片描述生成

**功能說明**：
- 使用 AI Vision 模型分析圖片內容
- 生成詳細的中文描述
- 自動向量化並存入知識庫

**支持的模型**：
- **Qwen VL Max**（OpenRouter）- 推薦
  - 成本：$0.0002/張
  - 質量：優秀
  - 速度：快
- **Google Gemini Vision**（免費額度）
  - 成本：免費 1500 次/月
  - 質量：優秀
  - 速度：中等

**使用方法**：
```bash
# 使用 OpenRouter (Qwen VL Max)
node process-all-media.js 100

# 使用 Google Gemini（免費）
node process-images-gemini.js 100
```

**生成的描述示例**：
```
這張圖片是一張在室內活動場地拍攝的自拍照，呈現了三位人物歡樂聚首的場景，
背景顯示這是一場正式或半正式的活動...（詳細描述人物、場景、物品）
```

### 3. 🔍 OCR 文字提取

**功能說明**：
- 從圖片中提取文字內容
- 支持中英文混合
- 保留原始排版格式
- 自動向量化便於搜索

**OCR 模式**：

| 模式 | 用途 | 輸出格式 |
|------|------|----------|
| `general` | 通用文字提取 | 純文字 |
| `businessCard` | 名片識別 | JSON（姓名、電話、郵箱等）|
| `document` | 文檔提取 | Markdown（保留結構）|
| `receipt` | 收據/發票 | JSON（商家、金額、日期等）|
| `screenshot` | 截圖文字 | 純文字（保留排版）|

**使用方法**：

```bash
# 基本用法：處理指定數量的圖片
node ocr-with-embedding.js 100

# 測試單張圖片（通用模式）
node ocr-openrouter.js test data/media/圖片.jpg

# 測試單張圖片（名片模式）
node ocr-openrouter.js test data/media/名片.jpg businessCard

# 批量處理（指定模式）
node ocr-openrouter.js 100 document
```

**OCR 結果示例**：
```
叮叮車仔麵

24 HOURS
Vending Machine

PULL

Hong Kong
叮叮車仔麵
```

### 4. 🎥 視頻分析

**功能說明**：
- 提取視頻關鍵幀
- 使用 Gemini Vision 分析內容
- 生成視頻摘要和描述

**使用方法**：
```bash
node process-video-gemini.js 50
```

**成本**：約 $0.01/視頻

### 5. 🎙️ 音頻轉錄

**功能說明**：
- 使用 OpenAI Whisper 轉錄音頻
- 支持多語言（中文、英文等）
- 高準確度語音識別

**使用方法**：
```bash
node process-audio-whisper.js 100
```

**成本**：約 $0.012/分鐘

### 6. 📄 文檔處理

**功能說明**：
- 提取 PDF、Word、Excel 內容
- 轉換為純文字格式
- 自動向量化

**支持格式**：
- PDF（.pdf）
- Word（.doc, .docx）
- Excel（.xls, .xlsx）

**使用方法**：
```bash
node process-documents.js 100
```

**成本**：免費（本地處理）

### 7. 🔎 智能搜索

**功能說明**：
- 基於向量的語義搜索
- 支持模糊匹配
- 跨媒體類型搜索

**使用方法**：
```bash
# 搜索關鍵詞
node test-vector-search.js "帆船"
node test-vector-search.js "市場快訊"
node test-vector-search.js "電話號碼"

# 搜索特定類型
node search-sailing.js  # 搜索帆船相關
```

**搜索結果示例**：
```
✅ 找到 20 個相關結果

1. 相似度: 52.7%
   類型: 圖片
   來源: Kiasu L Sailing ⛵
   內容: 這張圖片展示了一艘帆船在香港海域航行...
```

---

## 技術架構

### 🗄️ 數據庫設計

**Supabase PostgreSQL**

#### 表 1: `whatsapp_messages`

存儲原始 WhatsApp 消息

| 列名 | 類型 | 說明 |
|------|------|------|
| `session_id` | TEXT | 會話 ID |
| `message_id` | TEXT | 消息 ID（主鍵）|
| `remote_jid` | TEXT | 聊天對象 ID |
| `from_me` | BOOLEAN | 是否為自己發送 |
| `message_timestamp` | BIGINT | 消息時間戳 |
| `push_name` | TEXT | 發送者名稱 |
| `message_type` | TEXT | 消息類型 |
| `content` | TEXT | 文字內容 |
| `attachment_path` | TEXT | 附件路徑 |
| `full_message_json` | JSONB | 完整消息 JSON |
| `participant` | TEXT | 群組參與者 |
| `participant_phone` | TEXT | 參與者電話 |
| `created_at` | TIMESTAMP | 創建時間 |
| `updated_at` | TIMESTAMP | 更新時間 |

#### 表 2: `rag_knowledge`

存儲向量化的知識庫

| 列名 | 類型 | 說明 |
|------|------|------|
| `id` | BIGINT | 自增主鍵 |
| `session_id` | TEXT | 會話 ID |
| `source_type` | TEXT | 來源類型 |
| `content` | TEXT | 內容文本 |
| `embedding` | VECTOR(768) | 向量（768 維）|
| `metadata` | JSONB | 元數據 |
| `created_at` | TIMESTAMP | 創建時間 |
| `updated_at` | TIMESTAMP | 更新時間 |

**source_type 類型**：
- `text` - 純文字消息
- `image` - 圖片描述
- `image_ocr` - OCR 提取的文字
- `video` - 視頻描述
- `audio` - 音頻轉錄
- `document` - 文檔內容
- `pdf` - PDF 內容
- `word` - Word 內容
- `excel` - Excel 內容

### 🤖 AI 模型與 API

#### 1. OpenRouter（推薦）

**用途**：圖片描述、OCR
**模型**：`qwen/qwen-vl-max`
**配置**：
```env
GEMINI_API_KEY=sk-or-v1-xxxxx
```

**費率**：
- 圖片分析：$0.0002/張
- OCR：$0.0002/張

**獲取方式**：https://openrouter.ai/keys

#### 2. Jina AI

**用途**：文本向量化
**模型**：`jina-embeddings-v3`
**配置**：
```env
JINA_API_KEY=jina_xxxxx
```

**費率**：
- Embeddings：$0.00002/1K tokens
- 768 維向量

**獲取方式**：https://jina.ai/

#### 3. Google Gemini（可選）

**用途**：圖片描述、視頻分析、OCR
**模型**：`gemini-1.5-flash`
**配置**：
```env
GOOGLE_GEMINI_API_KEY=AIzaSyxxxxx
```

**費率**：
- 免費額度：1500 次/月
- 超出後：~$0.001/張

**獲取方式**：https://makersuite.google.com/app/apikey

#### 4. OpenAI Whisper（可選）

**用途**：音頻轉錄
**模型**：`whisper-1`
**配置**：
```env
OPENAI_API_KEY=sk-xxxxx
```

**費率**：
- 轉錄：$0.006/分鐘

**獲取方式**：https://platform.openai.com/api-keys

### 📁 項目結構

```
whatsapp-crm/
├── data/                          # 數據目錄
│   └── media/                     # 媒體文件存儲
├── .env                           # 環境變量配置
├── package.json                   # 項目依賴
│
├── import-whatsapp-zip.js         # WhatsApp ZIP 導入
│
├── process-all-media.js           # 圖片描述（OpenRouter）
├── process-images-gemini.js       # 圖片描述（Gemini）
│
├── ocr-with-embedding.js          # OCR + 向量化（推薦）
├── ocr-openrouter.js              # OCR（OpenRouter）
├── ocr-gemini.js                  # OCR（Gemini）
│
├── process-video-gemini.js        # 視頻處理
├── process-audio-whisper.js       # 音頻轉錄
├── process-documents.js           # 文檔處理
│
├── embed-all-knowledge.js         # 批量向量化
├── test-vector-search.js          # 向量搜索測試
├── search-sailing.js              # 專題搜索示例
│
├── check-ocr-progress.sh          # OCR 進度監控
├── run-process-images.sh          # 圖片處理腳本
│
├── README.md                      # 本文件
├── DEVELOPMENT_GUIDE.md           # 開發指南（即將創建）
└── API_REFERENCE.md               # API 參考（即將創建）
```

### 🔄 數據處理流程

```
WhatsApp ZIP
    ↓
[導入] import-whatsapp-zip.js
    ↓
whatsapp_messages 表
    ↓
[分類處理]
    ├─→ 圖片 → process-all-media.js → 生成描述
    ├─→ 圖片 → ocr-with-embedding.js → 提取文字
    ├─→ 視頻 → process-video-gemini.js → 生成摘要
    ├─→ 音頻 → process-audio-whisper.js → 轉錄文字
    └─→ 文檔 → process-documents.js → 提取內容
    ↓
[向量化] embed-all-knowledge.js
    ↓
rag_knowledge 表（含 embedding）
    ↓
[搜索] test-vector-search.js
    ↓
搜索結果
```

---

## 快速開始

### 📦 安裝依賴

```bash
# 克隆或進入項目目錄
cd whatsapp-crm

# 安裝 Node.js 依賴
npm install

# 必需依賴
npm install @supabase/supabase-js dotenv

# 圖片處理依賴
npm install @google/generative-ai

# OCR 依賴（已安裝）

# 文檔處理依賴
npm install pdf-parse mammoth exceljs

# 音頻處理依賴（如需要）
npm install openai
```

### ⚙️ 環境配置

創建 `.env` 文件：

```env
# OpenRouter API（推薦 - 用於圖片描述和 OCR）
GEMINI_API_KEY=sk-or-v1-your-key-here

# Jina AI（必需 - 用於向量化）
JINA_API_KEY=jina_your-key-here

# Google Gemini（可選 - 免費額度）
GOOGLE_GEMINI_API_KEY=AIzaSy-your-key-here

# OpenAI（可選 - 用於音頻轉錄）
OPENAI_API_KEY=sk-your-key-here
```

### 🚀 基本使用流程

#### 步驟 1: 導入 WhatsApp 數據

```bash
# 從 WhatsApp 導出聊天記錄為 ZIP
# 然後運行：
node import-whatsapp-zip.js path/to/chat.zip
```

#### 步驟 2: 處理圖片生成描述

```bash
# 使用 OpenRouter（推薦，已付費）
node process-all-media.js 100

# 或使用 Gemini（免費）
node process-images-gemini.js 100
```

#### 步驟 3: OCR 提取圖片文字

```bash
# 一鍵 OCR + 向量化
node ocr-with-embedding.js 100

# 查看進度
./check-ocr-progress.sh
```

#### 步驟 4: 處理其他媒體

```bash
# 處理文檔（PDF、Word、Excel）
node process-documents.js 100

# 處理視頻
node process-video-gemini.js 50

# 處理音頻（需要 OpenAI API Key）
node process-audio-whisper.js 100
```

#### 步驟 5: 向量化（如未自動完成）

```bash
# 為所有未向量化的內容生成向量
node embed-all-knowledge.js
```

#### 步驟 6: 搜索測試

```bash
# 測試搜索功能
node test-vector-search.js "帆船"
node test-vector-search.js "市場快訊"
node test-vector-search.js "電話"
```

---

## 使用指南

### 📝 常見使用場景

#### 場景 1: 搜索特定主題的圖片和消息

```bash
# 搜索帆船相關內容
node test-vector-search.js "帆船 sailing"

# 搜索美食相關
node test-vector-search.js "餐廳 美食"

# 搜索活動海報
node test-vector-search.js "活動 event"
```

#### 場景 2: 查找包含特定文字的圖片

```bash
# 查找包含電話號碼的圖片
node test-vector-search.js "電話 phone"

# 查找名片
node test-vector-search.js "名片 business card"

# 查找收據發票
node test-vector-search.js "發票 receipt"
```

#### 場景 3: 批量處理新導入的媒體

```bash
# 1. 導入新的 WhatsApp ZIP
node import-whatsapp-zip.js new-chat.zip

# 2. 處理所有新圖片
node process-all-media.js 500

# 3. OCR 所有圖片
node ocr-with-embedding.js 500

# 4. 處理文檔
node process-documents.js 50
```

#### 場景 4: 分析特定聯繫人的內容

修改搜索腳本添加過濾：

```javascript
// 在 test-vector-search.js 中添加 metadata 過濾
.filter('metadata->contact_name', 'eq', 'John Doe')
```

### 🎛️ 高級配置

#### 自定義 OCR 提示詞

編輯 `ocr-with-embedding.js` 或 `ocr-openrouter.js`：

```javascript
const OCR_PROMPTS = {
    custom: `你的自定義提示詞...`
};
```

#### 調整向量搜索相似度閾值

編輯 `test-vector-search.js`：

```javascript
// 調整相似度閾值（0-1）
const SIMILARITY_THRESHOLD = 0.4; // 默認 0.4
```

#### 批量處理大小調整

```bash
# 每批處理 50 張（避免 rate limit）
node process-all-media.js 50

# 處理時間間隔（毫秒）
# 修改腳本中的 setTimeout 值
await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5秒
```

### 🔧 維護與優化

#### 數據庫維護

```sql
-- 檢查知識庫大小
SELECT 
    source_type,
    COUNT(*) as count,
    COUNT(embedding) as embedded_count
FROM rag_knowledge
WHERE session_id = 'your-session-id'
GROUP BY source_type;

-- 刪除重複數據
DELETE FROM rag_knowledge a
USING rag_knowledge b
WHERE a.id > b.id
AND a.content = b.content
AND a.session_id = b.session_id;

-- 重建向量索引（提升搜索速度）
REINDEX INDEX rag_knowledge_embedding_idx;
```

#### 性能優化建議

1. **批量處理**：
   - 將大任務分成小批次（50-100 個/批）
   - 避免單次處理過多數據

2. **並發控制**：
   - 同時運行多個處理腳本時注意 API rate limit
   - OpenRouter: 60 RPM
   - Jina AI: 500 RPM
   - Gemini: 15 RPM（免費版）

3. **成本控制**：
   - 優先處理重要內容
   - 使用免費 API（Gemini）處理測試數據
   - 監控 API 使用量

---

## 開發文檔

### 🛠️ 添加新的處理器

#### 步驟 1: 創建處理器文件

```javascript
// process-my-media.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function processMyMedia(limit) {
    // 1. 獲取待處理的數據
    const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('message_type', 'myMediaType')
        .limit(limit);
    
    // 2. 處理每個項目
    for (const msg of messages) {
        // 你的處理邏輯
        const result = await myProcessingFunction(msg);
        
        // 3. 保存到知識庫
        await supabase.from('rag_knowledge').insert({
            session_id: msg.session_id,
            source_type: 'my_media',
            content: result.content,
            metadata: {
                original_path: msg.attachment_path,
                // 其他元數據
            }
        });
    }
}

// 執行
const limit = parseInt(process.argv[2]) || 10;
processMyMedia(limit).catch(console.error);
```

#### 步驟 2: 添加向量化支持

```javascript
// 在保存前生成 embedding
const embedding = await generateEmbedding(result.content);

await supabase.from('rag_knowledge').insert({
    // ... 其他字段
    embedding: embedding
});
```

### 🧪 測試

#### 單元測試示例

```javascript
// test-ocr.js
const { performOCR } = require('./ocr-with-embedding');

async function test() {
    const result = await performOCR('data/media/test.jpg');
    
    console.assert(result.success === true, 'OCR should succeed');
    console.assert(result.text.length > 0, 'Should extract text');
    
    console.log('✅ 測試通過');
}

test();
```

#### 性能測試

```bash
# 測試處理速度
time node process-all-media.js 10

# 測試搜索速度
time node test-vector-search.js "test query"
```

### 📚 代碼規範

1. **命名規範**：
   - 文件名：`kebab-case.js`
   - 函數名：`camelCase()`
   - 常量：`UPPER_SNAKE_CASE`

2. **錯誤處理**：
   ```javascript
   try {
       // 操作
   } catch (error) {
       console.error('錯誤描述:', error.message);
       // 適當的錯誤處理
   }
   ```

3. **異步處理**：
   ```javascript
   // 使用 async/await
   async function myFunction() {
       const result = await someAsyncOperation();
       return result;
   }
   ```

---

## API 參考

### Supabase 客戶端

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://your-project.supabase.co',
    'your-service-role-key'
);
```

### 常用查詢

#### 插入數據

```javascript
const { data, error } = await supabase
    .from('rag_knowledge')
    .insert({
        session_id: 'xxx',
        source_type: 'image',
        content: 'content here',
        embedding: [0.1, 0.2, ...], // 768維數組
        metadata: { key: 'value' }
    })
    .select();
```

#### 向量搜索

```javascript
const { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,     // 768維查詢向量
    match_threshold: 0.4,          // 相似度閾值
    match_count: 10,               // 返回數量
    p_session_id: 'xxx'            // 會話ID
});
```

#### 批量更新

```javascript
const { data, error } = await supabase
    .from('rag_knowledge')
    .update({ embedding: newEmbedding })
    .eq('id', recordId);
```

### Jina AI Embeddings

```javascript
const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JINA_API_KEY}`
    },
    body: JSON.stringify({
        model: 'jina-embeddings-v3',
        task: 'retrieval.passage',
        dimensions: 768,
        input: ['文本內容']
    })
});

const data = await response.json();
const embedding = data.data[0].embedding; // 768維向量
```

### OpenRouter Vision API

```javascript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        model: 'qwen/qwen-vl-max',
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: '描述這張圖片' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` }}
            ]
        }]
    })
});

const data = await response.json();
const description = data.choices[0].message.content;
```

---

## 故障排除

### 常見問題

#### 1. API 錯誤

**問題**：`401 Unauthorized` 或 `API key invalid`

**解決**：
- 檢查 `.env` 文件中的 API Key 是否正確
- 確認 API Key 有足夠的額度
- 檢查 API Key 權限設置

```bash
# 測試 API Key
node -e "console.log(process.env.JINA_API_KEY)"
```

#### 2. 數據庫連接失敗

**問題**：`Failed to connect to database`

**解決**：
- 檢查 Supabase URL 和 Key
- 確認網絡連接正常
- 檢查 Supabase 項目狀態

#### 3. 向量維度不匹配

**問題**：`expected 768 dimensions, not 1024`

**解決**：
```javascript
// 確保向量維度為 768
dimensions: 768  // 在 Jina API 調用中
```

#### 4. Rate Limit 超限

**問題**：`429 Too Many Requests`

**解決**：
- 減少批量處理大小
- 增加請求間隔時間
- 使用多個 API Key 輪換

```javascript
// 增加延遲
await new Promise(r => setTimeout(r, 2000)); // 2秒
```

#### 5. 內存不足

**問題**：`JavaScript heap out of memory`

**解決**：
```bash
# 增加 Node.js 內存限制
NODE_OPTIONS="--max-old-space-size=4096" node script.js
```

#### 6. 文件路徑錯誤

**問題**：`File not found` 或 `ENOENT`

**解決**：
- 使用絕對路徑
- 檢查文件是否存在
- 確認文件權限

```javascript
const path = require('path');
const fullPath = path.resolve(__dirname, 'data/media/file.jpg');
```

### 調試技巧

#### 啟用詳細日誌

```javascript
// 在腳本開頭添加
process.env.DEBUG = '*';
```

#### 查看 API 響應

```javascript
const response = await fetch(url, options);
console.log('Status:', response.status);
console.log('Headers:', response.headers);
const data = await response.json();
console.log('Data:', JSON.stringify(data, null, 2));
```

#### 檢查數據庫狀態

```javascript
const { data, error, status, statusText } = await supabase
    .from('rag_knowledge')
    .select('*')
    .limit(1);

console.log('Status:', status, statusText);
console.log('Error:', error);
console.log('Data:', data);
```

---

## 成本分析

### 💰 詳細費用估算

#### OpenRouter（推薦）

| 項目 | 單價 | 數量 | 總計 |
|------|------|------|------|
| 圖片描述 | $0.0002/張 | 1488張 | $0.30 |
| OCR | $0.0002/張 | 1488張 | $0.30 |
| **小計** | | | **$0.60** |

#### Jina AI

| 項目 | 單價 | 數量 | 總計 |
|------|------|------|------|
| Embeddings | $0.02/1M tokens | ~500K tokens | $0.01 |
| **小計** | | | **$0.01** |

#### Google Gemini（可選）

| 項目 | 單價 | 數量 | 總計 |
|------|------|------|------|
| 圖片分析 | 免費 | 1500張/月 | $0.00 |
| 超出部分 | $0.001/張 | 0張 | $0.00 |
| **小計** | | | **$0.00** |

#### OpenAI Whisper（可選）

| 項目 | 單價 | 數量 | 總計 |
|------|------|------|------|
| 音頻轉錄 | $0.006/分鐘 | 363個文件（~300分鐘）| $1.80 |
| **小計** | | | **$1.80** |

### 總計成本

- **基礎功能**（圖片描述 + OCR + 向量化）：**$0.61**
- **含音頻轉錄**：**$2.41**
- **月度成本**（穩定運行）：**< $5**

### 💡 成本優化建議

1. **使用免費 API**：
   - Google Gemini 免費額度：1500次/月
   - 足夠處理大部分個人使用場景

2. **批量處理**：
   - 集中處理可減少 API 調用次數
   - 避免重複處理已有數據

3. **選擇性處理**：
   - 優先處理重要內容
   - 跳過低質量或重複圖片

4. **混合使用**：
   - 測試用 Gemini（免費）
   - 生產用 OpenRouter（付費但便宜）

---

## 📞 支持與反饋

### 獲取幫助

- **文檔**：查看本 README 和其他文檔文件
- **日誌**：檢查處理日誌文件（`*.log`）
- **調試**：啟用詳細日誌模式

### 貢獻指南

歡迎提交：
- Bug 報告
- 功能建議
- 代碼改進
- 文檔優化

### 版本歷史

- **v1.0** (2026-02) - 初始版本
  - WhatsApp 數據導入
  - 圖片描述生成
  - OCR 文字提取
  - 向量搜索功能
  - 音頻轉錄
  - 文檔處理

---

## 📄 許可證

本項目僅供個人學習和研究使用。

---

## 🙏 致謝

感謝以下開源項目和服務：

- [Supabase](https://supabase.com/) - 數據庫和向量存儲
- [Jina AI](https://jina.ai/) - 文本向量化
- [OpenRouter](https://openrouter.ai/) - AI 模型接入
- [Google Gemini](https://ai.google.dev/) - 視覺和文本 AI
- [OpenAI](https://openai.com/) - 音頻轉錄

---

**最後更新**：2026-02-09

**作者**：WhatsApp CRM Team

**聯繫方式**：請查看項目文檔
