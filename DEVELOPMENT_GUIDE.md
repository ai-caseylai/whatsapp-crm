# WhatsApp CRM - 開發指南

> 面向開發者的詳細技術文檔

## 📋 目錄

- [開發環境設置](#開發環境設置)
- [架構設計](#架構設計)
- [核心模塊](#核心模塊)
- [API 集成](#api-集成)
- [數據庫操作](#數據庫操作)
- [擴展開發](#擴展開發)
- [測試指南](#測試指南)
- [部署指南](#部署指南)
- [最佳實踐](#最佳實踐)

---

## 開發環境設置

### 系統要求

- **Node.js**: >= 16.x
- **npm**: >= 8.x
- **macOS**: 10.15+ / **Linux**: Ubuntu 20.04+ / **Windows**: 10+
- **內存**: >= 4GB RAM
- **存儲**: >= 10GB 可用空間

### 安裝步驟

```bash
# 1. 克隆項目
git clone <repository-url>
cd whatsapp-crm

# 2. 安裝依賴
npm install

# 3. 配置環境變量
cp .env.example .env
# 編輯 .env 文件添加你的 API keys

# 4. 測試連接
node test-supabase-connection.js
```

### IDE 配置

#### VS Code 推薦插件

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "bradlc.vscode-tailwindcss"
  ]
}
```

#### ESLint 配置

```javascript
// .eslintrc.js
module.exports = {
  env: {
    node: true,
    es2021: true
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 12
  },
  rules: {
    'no-console': 'off',
    'no-unused-vars': 'warn'
  }
};
```

---

## 架構設計

### 系統架構圖

```
┌─────────────────────────────────────────────────────────┐
│                   WhatsApp CRM System                    │
└─────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
    │   Data Layer │ │ Processing │ │   Search   │
    │              │ │   Layer    │ │   Layer    │
    └───────┬──────┘ └─────┬──────┘ └─────┬──────┘
            │               │               │
    ┌───────▼───────────────▼───────────────▼──────┐
    │                                               │
    │            Supabase PostgreSQL                │
    │   ┌──────────────────┬──────────────────┐    │
    │   │ whatsapp_messages │  rag_knowledge  │    │
    │   └──────────────────┴──────────────────┘    │
    │                                               │
    └───────────────────────┬───────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
    │  OpenRouter  │ │  Jina AI   │ │   Gemini   │
    │ (Vision/OCR) │ │ (Embedding)│ │  (Vision)  │
    └──────────────┘ └────────────┘ └────────────┘
```

### 數據流

```
Input Data (ZIP/Media)
    ↓
[Extract & Parse]
    ↓
whatsapp_messages (Raw Data)
    ↓
[AI Processing Pipeline]
    ├─→ Image → Vision API → Description
    ├─→ Image → OCR API → Text Extraction
    ├─→ Video → Vision API → Summary
    ├─→ Audio → Whisper → Transcription
    └─→ Document → Parser → Content
    ↓
[Vectorization]
    ↓
rag_knowledge (Processed Data + Embeddings)
    ↓
[Vector Search]
    ↓
Search Results
```

### 模塊依賴關系

```javascript
// 依賴層次
Level 1: Core Libraries
├── @supabase/supabase-js
├── dotenv
└── fs/path (Node.js內置)

Level 2: AI/ML Libraries
├── @google/generative-ai
├── openai
├── pdf-parse
├── mammoth
└── exceljs

Level 3: Business Logic
├── import-whatsapp-zip.js
├── process-*.js
└── embed-all-knowledge.js

Level 4: Application Layer
├── test-vector-search.js
└── search-*.js
```

---

## 核心模塊

### 1. 數據導入模塊

**文件**: `import-whatsapp-zip.js`

**職責**:
- 解壓 ZIP 文件
- 解析消息 JSON
- 提取媒體文件
- 保存到數據庫

**關鍵函數**:

```javascript
/**
 * 解壓 ZIP 文件到臨時目錄
 * @param {string} zipPath - ZIP 文件路徑
 * @returns {Promise<string>} 解壓目錄路徑
 */
async function extractZip(zipPath) {
    const extractPath = path.join(__dirname, 'temp', Date.now().toString());
    await fs.promises.mkdir(extractPath, { recursive: true });
    
    // 使用 unzipper 或類似庫解壓
    // ...
    
    return extractPath;
}

/**
 * 解析消息 JSON 文件
 * @param {string} jsonPath - JSON 文件路徑
 * @returns {Promise<Array>} 消息數組
 */
async function parseMessages(jsonPath) {
    const content = await fs.promises.readFile(jsonPath, 'utf-8');
    const messages = JSON.parse(content);
    
    return messages.map(msg => ({
        message_id: msg.key.id,
        message_type: Object.keys(msg.message)[0],
        content: extractContent(msg),
        timestamp: msg.messageTimestamp,
        // ... 其他字段
    }));
}

/**
 * 批量插入消息到數據庫
 * @param {Array} messages - 消息數組
 * @param {string} sessionId - 會話ID
 */
async function insertMessages(messages, sessionId) {
    const batchSize = 100;
    
    for (let i = 0; i < messages.length; i += batchSize) {
        const batch = messages.slice(i, i + batchSize);
        
        const { error } = await supabase
            .from('whatsapp_messages')
            .insert(batch.map(msg => ({
                ...msg,
                session_id: sessionId
            })));
        
        if (error) {
            console.error(`批次 ${i} 插入失敗:`, error);
        }
    }
}
```

### 2. 圖片處理模塊

**文件**: `process-all-media.js`, `process-images-gemini.js`

**職責**:
- 獲取未處理的圖片
- 調用 Vision API 生成描述
- 生成向量並保存

**關鍵函數**:

```javascript
/**
 * 使用 Vision API 分析圖片
 * @param {string} imagePath - 圖片路徑
 * @param {string} prompt - 提示詞
 * @returns {Promise<string>} 圖片描述
 */
async function analyzeImage(imagePath, prompt) {
    // 讀取圖片並轉 base64
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    
    // 調用 API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'WhatsApp CRM'
        },
        body: JSON.stringify({
            model: 'qwen/qwen-vl-max',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`
                        }
                    }
                ]
            }],
            temperature: 0.7,
            max_tokens: 1000
        })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
}

/**
 * 批量處理圖片
 * @param {number} limit - 處理數量限制
 */
async function processImages(limit) {
    // 1. 獲取待處理圖片
    const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('message_type', 'imageMessage')
        .is('processed', null)
        .limit(limit);
    
    // 2. 逐個處理
    for (const msg of messages) {
        try {
            const imagePath = path.join(MEDIA_DIR, msg.attachment_path);
            const description = await analyzeImage(imagePath, PROMPT);
            
            // 3. 生成向量
            const embedding = await generateEmbedding(description);
            
            // 4. 保存到知識庫
            await supabase.from('rag_knowledge').insert({
                session_id: msg.session_id,
                source_type: 'image',
                content: description,
                embedding: embedding,
                metadata: {
                    message_id: msg.message_id,
                    attachment_path: msg.attachment_path
                }
            });
            
            // 5. 標記為已處理
            await supabase
                .from('whatsapp_messages')
                .update({ processed: true })
                .eq('message_id', msg.message_id);
            
        } catch (error) {
            console.error(`處理失敗:`, error);
        }
        
        // 避免 rate limit
        await sleep(1500);
    }
}
```

### 3. OCR 模塊

**文件**: `ocr-with-embedding.js`, `ocr-openrouter.js`

**職責**:
- 從圖片提取文字
- 支持多種 OCR 模式
- 自動向量化

**關鍵函數**:

```javascript
/**
 * OCR 提示詞模板
 */
const OCR_PROMPTS = {
    general: `請提取圖片中的所有文字...`,
    businessCard: `請識別名片信息，JSON格式...`,
    document: `請提取文檔內容，保持格式...`,
    receipt: `請識別收據信息...`,
    screenshot: `請提取截圖文字...`
};

/**
 * 執行 OCR
 * @param {string} imagePath - 圖片路徑
 * @param {string} mode - OCR 模式
 * @returns {Promise<Object>} OCR 結果
 */
async function performOCR(imagePath, mode = 'general') {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    
    const prompt = OCR_PROMPTS[mode] || OCR_PROMPTS.general;
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'qwen/qwen-vl-max',
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` }}
                ]
            }],
            temperature: 0.1,  // 低溫度提高準確性
            max_tokens: 2000
        })
    });
    
    const data = await response.json();
    const text = data.choices[0].message.content.trim();
    
    return {
        success: true,
        text,
        hasText: text !== '無文字內容' && text.length > 0
    };
}
```

### 4. 向量化模塊

**文件**: `embed-all-knowledge.js`

**職責**:
- 為文本生成向量
- 批量處理未向量化的內容
- 錯誤重試機制

**關鍵函數**:

```javascript
/**
 * 生成文本向量
 * @param {string} text - 輸入文本
 * @returns {Promise<Array>} 768維向量
 */
async function generateEmbedding(text) {
    const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.JINA_API_KEY}`
        },
        body: JSON.stringify({
            model: 'jina-embeddings-v3',
            task: 'retrieval.passage',
            dimensions: 768,
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
}

/**
 * 批量向量化未處理的內容
 */
async function embedAllKnowledge() {
    // 獲取未向量化的記錄
    const { data: records } = await supabase
        .from('rag_knowledge')
        .select('id, content')
        .is('embedding', null)
        .limit(1000);
    
    console.log(`找到 ${records.length} 條待向量化記錄`);
    
    for (const record of records) {
        try {
            const embedding = await generateEmbedding(record.content);
            
            await supabase
                .from('rag_knowledge')
                .update({ embedding })
                .eq('id', record.id);
            
            console.log(`✅ ID ${record.id} 向量化完成`);
            
        } catch (error) {
            console.error(`❌ ID ${record.id} 失敗:`, error.message);
        }
        
        await sleep(100); // 避免 rate limit
    }
}
```

### 5. 搜索模塊

**文件**: `test-vector-search.js`

**職責**:
- 查詢向量化
- 向量相似度搜索
- 結果排序和格式化

**關鍵函數**:

```javascript
/**
 * 向量搜索
 * @param {string} query - 搜索查詢
 * @param {number} limit - 結果數量
 * @returns {Promise<Array>} 搜索結果
 */
async function vectorSearch(query, limit = 10) {
    // 1. 生成查詢向量
    const queryEmbedding = await generateEmbedding(query);
    
    // 2. 執行向量搜索
    const { data, error } = await supabase.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: limit,
        p_session_id: SESSION_ID
    });
    
    if (error) {
        throw new Error(`搜索失敗: ${error.message}`);
    }
    
    // 3. 格式化結果
    return data.map(result => ({
        id: result.id,
        content: result.content,
        similarity: (1 - result.distance) * 100,
        source_type: result.source_type,
        metadata: result.metadata,
        created_at: result.created_at
    }));
}

/**
 * 顯示搜索結果
 * @param {Array} results - 搜索結果
 */
function displayResults(results) {
    console.log(`\n✅ 找到 ${results.length} 個相關文檔\n`);
    
    results.forEach((result, index) => {
        console.log(`${index + 1}. 相似度: ${result.similarity.toFixed(1)}%`);
        console.log(`   類型: ${result.source_type}`);
        console.log(`   內容: ${result.content.substring(0, 100)}...`);
        console.log();
    });
}
```

---

## API 集成

### OpenRouter API

**用途**: 圖片描述、OCR

**配置**:
```javascript
const OPENROUTER_CONFIG = {
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'qwen/qwen-vl-max',
    headers: {
        'Authorization': `Bearer ${process.env.GEMINI_API_KEY}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'WhatsApp CRM'
    }
};
```

**請求示例**:
```javascript
async function callOpenRouter(prompt, image) {
    const response = await fetch(`${OPENROUTER_CONFIG.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
            ...OPENROUTER_CONFIG.headers,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: OPENROUTER_CONFIG.model,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: image }}
                ]
            }],
            temperature: 0.7,
            max_tokens: 1000
        })
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter 錯誤 ${response.status}: ${error}`);
    }
    
    return response.json();
}
```

**Rate Limits**:
- 60 requests/minute
- 建議間隔：1-2 秒/請求

**錯誤處理**:
```javascript
async function safeCallOpenRouter(prompt, image, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await callOpenRouter(prompt, image);
        } catch (error) {
            if (error.message.includes('429') && i < retries - 1) {
                // Rate limit，等待後重試
                await sleep(5000 * (i + 1));
                continue;
            }
            throw error;
        }
    }
}
```

### Jina AI API

**用途**: 文本向量化

**配置**:
```javascript
const JINA_CONFIG = {
    baseURL: 'https://api.jina.ai/v1',
    model: 'jina-embeddings-v3',
    dimensions: 768,
    task: 'retrieval.passage'
};
```

**請求示例**:
```javascript
async function callJinaEmbeddings(texts) {
    const response = await fetch(`${JINA_CONFIG.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.JINA_API_KEY}`
        },
        body: JSON.stringify({
            model: JINA_CONFIG.model,
            task: JINA_CONFIG.task,
            dimensions: JINA_CONFIG.dimensions,
            embedding_type: 'float',
            input: Array.isArray(texts) ? texts : [texts]
        })
    });
    
    if (!response.ok) {
        throw new Error(`Jina API 錯誤: ${response.status}`);
    }
    
    const data = await response.json();
    return data.data.map(item => item.embedding);
}
```

**批量處理**:
```javascript
async function batchEmbeddings(texts, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await callJinaEmbeddings(batch);
        results.push(...embeddings);
        
        await sleep(200); // Rate limit 保護
    }
    
    return results;
}
```

### Google Gemini API

**用途**: 圖片/視頻分析（免費選項）

**配置**:
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024
    }
});
```

**請求示例**:
```javascript
async function callGeminiVision(prompt, imagePath) {
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');
    
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg'
        }
    };
    
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text();
}
```

---

## 數據庫操作

### Supabase 連接

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);
```

### 常用查詢模式

#### 插入數據

```javascript
// 單條插入
const { data, error } = await supabase
    .from('rag_knowledge')
    .insert({
        session_id: 'xxx',
        source_type: 'image',
        content: 'content',
        embedding: embedding,
        metadata: { key: 'value' }
    })
    .select();

// 批量插入
const { data, error } = await supabase
    .from('rag_knowledge')
    .insert(arrayOfRecords)
    .select();
```

#### 更新數據

```javascript
// 條件更新
const { data, error } = await supabase
    .from('rag_knowledge')
    .update({ embedding: newEmbedding })
    .eq('id', recordId)
    .select();

// 批量更新
const { data, error } = await supabase
    .from('rag_knowledge')
    .update({ processed: true })
    .in('id', [1, 2, 3])
    .select();
```

#### 查詢數據

```javascript
// 基本查詢
const { data, error } = await supabase
    .from('whatsapp_messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('message_type', 'imageMessage')
    .limit(100);

// 複雜查詢
const { data, error } = await supabase
    .from('rag_knowledge')
    .select('id, content, metadata')
    .eq('session_id', sessionId)
    .in('source_type', ['image', 'image_ocr'])
    .is('embedding', null)
    .order('created_at', { ascending: false })
    .range(0, 99);
```

#### 向量搜索

```javascript
// 創建向量搜索函數（在 Supabase 中）
/*
CREATE OR REPLACE FUNCTION match_knowledge(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    p_session_id text
)
RETURNS TABLE (
    id bigint,
    content text,
    source_type text,
    metadata jsonb,
    distance float,
    created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        rk.id,
        rk.content,
        rk.source_type,
        rk.metadata,
        1 - (rk.embedding <=> query_embedding) as distance,
        rk.created_at
    FROM rag_knowledge rk
    WHERE rk.session_id = p_session_id
        AND rk.embedding IS NOT NULL
        AND 1 - (rk.embedding <=> query_embedding) > match_threshold
    ORDER BY rk.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
*/

// 調用向量搜索
const { data, error } = await supabase.rpc('match_knowledge', {
    query_embedding: embedding,
    match_threshold: 0.4,
    match_count: 10,
    p_session_id: sessionId
});
```

### 事務處理

```javascript
// Supabase 不直接支持事務，但可以使用 PostgreSQL 函數
async function atomicOperation(data1, data2) {
    // 方法 1: 使用 try-catch + 回滾邏輯
    let inserted1, inserted2;
    
    try {
        // 第一步
        const { data: result1, error: error1 } = await supabase
            .from('table1')
            .insert(data1)
            .select();
        
        if (error1) throw error1;
        inserted1 = result1[0];
        
        // 第二步
        const { data: result2, error: error2 } = await supabase
            .from('table2')
            .insert({ ...data2, related_id: inserted1.id })
            .select();
        
        if (error2) throw error2;
        inserted2 = result2[0];
        
        return { success: true, data: { inserted1, inserted2 }};
        
    } catch (error) {
        // 回滾：刪除已插入的數據
        if (inserted1) {
            await supabase.from('table1').delete().eq('id', inserted1.id);
        }
        
        return { success: false, error };
    }
}
```

### 索引優化

```sql
-- 為常用查詢字段創建索引
CREATE INDEX idx_whatsapp_messages_session_type 
ON whatsapp_messages(session_id, message_type);

CREATE INDEX idx_whatsapp_messages_timestamp 
ON whatsapp_messages(message_timestamp DESC);

-- 為向量搜索創建 HNSW 索引
CREATE INDEX idx_rag_knowledge_embedding 
ON rag_knowledge 
USING hnsw (embedding vector_cosine_ops);

-- 為 JSON 字段創建 GIN 索引
CREATE INDEX idx_rag_knowledge_metadata 
ON rag_knowledge 
USING gin (metadata);
```

---

## 擴展開發

### 添加新的媒體類型處理

```javascript
// process-new-media-type.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// 1. 定義配置
const MEDIA_TYPE = 'newMediaType';
const SOURCE_TYPE = 'new_media';

// 2. 創建處理函數
async function processNewMedia(filePath) {
    // 你的處理邏輯
    // 例如：調用特定 API、解析文件等
    
    const result = await yourCustomAPICall(filePath);
    return result.content;
}

// 3. 主處理流程
async function main(limit) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );
    
    // 獲取待處理數據
    const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('message_type', MEDIA_TYPE)
        .limit(limit);
    
    for (const msg of messages) {
        try {
            // 處理
            const content = await processNewMedia(msg.attachment_path);
            
            // 向量化
            const embedding = await generateEmbedding(content);
            
            // 保存
            await supabase.from('rag_knowledge').insert({
                session_id: msg.session_id,
                source_type: SOURCE_TYPE,
                content,
                embedding,
                metadata: {
                    message_id: msg.message_id,
                    attachment_path: msg.attachment_path
                }
            });
            
            console.log(`✅ 處理完成: ${msg.message_id}`);
            
        } catch (error) {
            console.error(`❌ 處理失敗:`, error);
        }
        
        await sleep(1000);
    }
}

// 執行
const limit = parseInt(process.argv[2]) || 10;
main(limit).catch(console.error);
```

### 自定義搜索過濾器

```javascript
// custom-search.js

/**
 * 高級搜索 - 支持多種過濾條件
 */
async function advancedSearch(options) {
    const {
        query,              // 搜索查詢
        sourceTypes = [],   // 來源類型過濾
        dateFrom,           // 開始日期
        dateTo,             // 結束日期
        contactNames = [],  // 聯繫人過濾
        limit = 10          // 結果數量
    } = options;
    
    // 1. 生成查詢向量
    const queryEmbedding = await generateEmbedding(query);
    
    // 2. 構建查詢
    let rpcQuery = supabase.rpc('match_knowledge', {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: limit * 2, // 獲取更多結果以便過濾
        p_session_id: SESSION_ID
    });
    
    // 3. 應用過濾器
    if (sourceTypes.length > 0) {
        rpcQuery = rpcQuery.in('source_type', sourceTypes);
    }
    
    if (dateFrom) {
        rpcQuery = rpcQuery.gte('created_at', dateFrom);
    }
    
    if (dateTo) {
        rpcQuery = rpcQuery.lte('created_at', dateTo);
    }
    
    const { data, error } = await rpcQuery;
    
    if (error) throw error;
    
    // 4. 客戶端過濾（metadata 過濾）
    let results = data;
    
    if (contactNames.length > 0) {
        results = results.filter(r => 
            contactNames.some(name => 
                r.metadata?.contact_name?.includes(name)
            )
        );
    }
    
    // 5. 限制結果數量
    return results.slice(0, limit);
}

// 使用示例
const results = await advancedSearch({
    query: '帆船活動',
    sourceTypes: ['image', 'image_ocr'],
    dateFrom: '2026-01-01',
    contactNames: ['Kiasu L Sailing']
});
```

### 創建自定義報告

```javascript
// generate-report.js

/**
 * 生成內容分析報告
 */
async function generateContentReport(sessionId) {
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
    );
    
    // 1. 統計各類型數量
    const { data: stats } = await supabase
        .from('rag_knowledge')
        .select('source_type')
        .eq('session_id', sessionId);
    
    const typeCount = stats.reduce((acc, item) => {
        acc[item.source_type] = (acc[item.source_type] || 0) + 1;
        return acc;
    }, {});
    
    // 2. 獲取熱門主題（使用關鍵詞提取）
    const { data: contents } = await supabase
        .from('rag_knowledge')
        .select('content')
        .eq('session_id', sessionId)
        .limit(1000);
    
    const keywords = extractKeywords(contents.map(c => c.content));
    
    // 3. 時間分布分析
    const { data: timeline } = await supabase
        .from('rag_knowledge')
        .select('created_at, source_type')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
    
    const timelineStats = analyzeTimeline(timeline);
    
    // 4. 生成報告
    const report = {
        generatedAt: new Date().toISOString(),
        sessionId,
        summary: {
            totalItems: stats.length,
            typeDistribution: typeCount,
            topKeywords: keywords.slice(0, 10),
            timeRange: {
                start: timeline[0]?.created_at,
                end: timeline[timeline.length - 1]?.created_at
            }
        },
        timeline: timelineStats
    };
    
    // 5. 保存報告
    fs.writeFileSync(
        `report-${sessionId}-${Date.now()}.json`,
        JSON.stringify(report, null, 2)
    );
    
    return report;
}

/**
 * 提取關鍵詞（簡單實現）
 */
function extractKeywords(texts) {
    const allWords = texts.join(' ').split(/\s+/);
    const wordCount = {};
    
    allWords.forEach(word => {
        word = word.toLowerCase().trim();
        if (word.length > 2) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });
    
    return Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .map(([word, count]) => ({ word, count }));
}
```

---

## 測試指南

### 單元測試

```javascript
// test/ocr.test.js

const { performOCR } = require('../ocr-with-embedding');
const assert = require('assert');

describe('OCR Module', () => {
    it('should extract text from image', async () => {
        const result = await performOCR('test/fixtures/test-image.jpg');
        
        assert.strictEqual(result.success, true);
        assert.ok(result.text.length > 0);
    });
    
    it('should handle image with no text', async () => {
        const result = await performOCR('test/fixtures/no-text.jpg');
        
        assert.strictEqual(result.hasText, false);
    });
    
    it('should support different modes', async () => {
        const result = await performOCR(
            'test/fixtures/business-card.jpg',
            'businessCard'
        );
        
        assert.strictEqual(result.success, true);
        assert.ok(result.text.includes('name'));
    });
});
```

### 集成測試

```javascript
// test/integration.test.js

describe('End-to-End Processing', () => {
    it('should process image and enable search', async () => {
        // 1. 處理圖片
        const description = await analyzeImage('test/fixtures/test.jpg');
        assert.ok(description.length > 0);
        
        // 2. 向量化
        const embedding = await generateEmbedding(description);
        assert.strictEqual(embedding.length, 768);
        
        // 3. 保存到數據庫
        const { data, error } = await supabase
            .from('rag_knowledge')
            .insert({
                session_id: 'test',
                source_type: 'image',
                content: description,
                embedding
            })
            .select();
        
        assert.strictEqual(error, null);
        assert.ok(data[0].id);
        
        // 4. 搜索測試
        const results = await vectorSearch('test query');
        assert.ok(results.length > 0);
        
        // 清理
        await supabase
            .from('rag_knowledge')
            .delete()
            .eq('id', data[0].id);
    });
});
```

### 性能測試

```javascript
// test/performance.test.js

describe('Performance Tests', () => {
    it('should process 100 images within time limit', async () => {
        const startTime = Date.now();
        
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(analyzeImage(`test/fixtures/image${i}.jpg`));
        }
        
        await Promise.all(promises);
        
        const duration = Date.now() - startTime;
        const avgTime = duration / 100;
        
        console.log(`平均處理時間: ${avgTime}ms`);
        assert.ok(avgTime < 2000, '處理時間應小於 2 秒');
    });
});
```

### 運行測試

```bash
# 安裝測試框架
npm install --save-dev mocha chai

# 運行所有測試
npm test

# 運行特定測試
npm test -- --grep "OCR"

# 生成覆蓋率報告
npm run test:coverage
```

---

## 部署指南

### 環境準備

```bash
# 1. 生產環境變量
cp .env.example .env.production

# 2. 配置生產環境
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_KEY=your-production-key
# ... 其他 API keys
```

### Docker 部署

```dockerfile
# Dockerfile
FROM node:16-alpine

WORKDIR /app

# 安裝依賴
COPY package*.json ./
RUN npm ci --only=production

# 複製源代碼
COPY . .

# 暴露端口（如有 API 服務）
EXPOSE 3000

# 啟動命令
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  whatsapp-crm:
    build: .
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - JINA_API_KEY=${JINA_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### PM2 部署（Node.js 進程管理）

```javascript
// ecosystem.config.js
module.exports = {
    apps: [{
        name: 'whatsapp-crm',
        script: 'server.js',
        instances: 1,
        exec_mode: 'cluster',
        env: {
            NODE_ENV: 'production'
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
};
```

```bash
# 啟動服務
pm2 start ecosystem.config.js

# 查看狀態
pm2 status

# 查看日誌
pm2 logs whatsapp-crm

# 重啟服務
pm2 restart whatsapp-crm

# 停止服務
pm2 stop whatsapp-crm
```

### 監控與日誌

```javascript
// logger.js
const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

module.exports = logger;
```

---

## 最佳實踐

### 代碼組織

```
src/
├── config/           # 配置文件
│   ├── database.js
│   ├── api.js
│   └── constants.js
├── services/         # 業務邏輯
│   ├── image.js
│   ├── ocr.js
│   └── embedding.js
├── utils/            # 工具函數
│   ├── logger.js
│   ├── retry.js
│   └── helpers.js
├── models/           # 數據模型
│   ├── Message.js
│   └── Knowledge.js
└── scripts/          # 可執行腳本
    ├── import.js
    └── process.js
```

### 錯誤處理

```javascript
// utils/errors.js

class APIError extends Error {
    constructor(message, statusCode, details) {
        super(message);
        this.name = 'APIError';
        this.statusCode = statusCode;
        this.details = details;
    }
}

class DatabaseError extends Error {
    constructor(message, query, details) {
        super(message);
        this.name = 'DatabaseError';
        this.query = query;
        this.details = details;
    }
}

// 統一錯誤處理器
function errorHandler(error) {
    logger.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
        details: error.details
    });
    
    if (error instanceof APIError) {
        // API 錯誤特殊處理
        if (error.statusCode === 429) {
            // Rate limit，等待重試
            return { retry: true, delay: 5000 };
        }
    }
    
    if (error instanceof DatabaseError) {
        // 數據庫錯誤特殊處理
        // ...
    }
    
    return { retry: false };
}
```

### 性能優化

```javascript
// 1. 批量處理
async function batchProcess(items, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(
            batch.map(item => processItem(item))
        );
        results.push(...batchResults);
    }
    
    return results;
}

// 2. 緩存策略
const cache = new Map();

async function getCachedEmbedding(text) {
    const cacheKey = hashText(text);
    
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    const embedding = await generateEmbedding(text);
    cache.set(cacheKey, embedding);
    
    return embedding;
}

// 3. 連接池
const pool = {
    maxConnections: 10,
    connections: [],
    
    async getConnection() {
        if (this.connections.length < this.maxConnections) {
            return createNewConnection();
        }
        
        return this.waitForConnection();
    }
};
```

### 安全實踐

```javascript
// 1. 環境變量驗證
function validateEnv() {
    const required = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_KEY',
        'JINA_API_KEY'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
        throw new Error(`缺少環境變量: ${missing.join(', ')}`);
    }
}

// 2. 輸入驗證
function validateInput(data, schema) {
    // 使用 joi 或類似庫驗證
    const { error, value } = schema.validate(data);
    
    if (error) {
        throw new Error(`輸入驗證失敗: ${error.message}`);
    }
    
    return value;
}

// 3. API Key 輪換
class APIKeyManager {
    constructor(keys) {
        this.keys = keys;
        this.currentIndex = 0;
    }
    
    getKey() {
        const key = this.keys[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        return key;
    }
}
```

---

**最後更新**: 2026-02-09

**維護者**: WhatsApp CRM Development Team
