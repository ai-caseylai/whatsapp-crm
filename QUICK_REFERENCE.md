# WhatsApp CRM - 快速參考手冊

> 常用命令和操作速查表

## 📝 目錄

- [快速開始](#快速開始)
- [常用命令](#常用命令)
- [API 密鑰獲取](#api-密鑰獲取)
- [故障排除](#故障排除)
- [成本參考](#成本參考)

---

## 快速開始

### 1分鐘快速設置

```bash
# 1. 進入項目目錄
cd whatsapp-crm

# 2. 安裝依賴
npm install

# 3. 配置環境變量（複製並編輯）
cp .env.example .env

# 4. 導入 WhatsApp 數據
node import-whatsapp-zip.js /path/to/chat.zip

# 5. 開始處理
node ocr-with-embedding.js 100
```

---

## 常用命令

### 數據導入

```bash
# 導入 WhatsApp ZIP 文件
node import-whatsapp-zip.js <ZIP路徑>

# 示例
node import-whatsapp-zip.js ~/Downloads/chat-export.zip
```

### 圖片處理

```bash
# 使用 OpenRouter 生成圖片描述
node process-all-media.js 100

# 使用 Google Gemini（免費）
node process-images-gemini.js 100

# 處理所有圖片
node process-all-media.js 1718
```

### OCR 文字提取

```bash
# 一鍵 OCR + 向量化（推薦）
node ocr-with-embedding.js 100

# 測試單張圖片
node ocr-openrouter.js test data/media/圖片.jpg

# 名片識別
node ocr-openrouter.js test data/media/名片.jpg businessCard

# 文檔提取
node ocr-openrouter.js test data/media/文檔.jpg document

# 收據識別
node ocr-openrouter.js test data/media/收據.jpg receipt

# 查看處理進度
./check-ocr-progress.sh

# 實時監控
tail -f ocr-processing.log
```

### 其他媒體處理

```bash
# 處理文檔（PDF/Word/Excel）- 免費
node process-documents.js 100

# 處理視頻
node process-video-gemini.js 50

# 處理音頻（需要 OpenAI API）
node process-audio-whisper.js 100
```

### 向量化

```bash
# 為所有未向量化的內容生成向量
node embed-all-knowledge.js
```

### 搜索

```bash
# 基本搜索
node test-vector-search.js "關鍵詞"

# 示例
node test-vector-search.js "帆船"
node test-vector-search.js "市場快訊"
node test-vector-search.js "電話號碼"
node test-vector-search.js "叮叮車仔麵"

# 專題搜索
node search-sailing.js
```

---

## API 密鑰獲取

### 必需的 API

#### 1. Supabase（數據庫）

**獲取方式**：
1. 訪問 https://supabase.com/
2. 創建項目
3. 進入 Settings > API
4. 複製 URL 和 service_role key

**配置**：
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
```

#### 2. Jina AI（向量化）- 必需

**獲取方式**：
1. 訪問 https://jina.ai/
2. 註冊帳號
3. 進入 API Keys 頁面
4. 創建新 API Key

**配置**：
```env
JINA_API_KEY=jina_xxxxxxxxxxxxx
```

**費率**：$0.02/1M tokens（非常便宜）

#### 3. OpenRouter（圖片/OCR）- 推薦

**獲取方式**：
1. 訪問 https://openrouter.ai/keys
2. 註冊並登錄
3. 創建 API Key
4. 充值（建議 $5-$10）

**配置**：
```env
GEMINI_API_KEY=sk-or-v1-xxxxxxxxxxxxx
```

**費率**：
- 圖片分析：$0.0002/張
- OCR：$0.0002/張

### 可選的 API

#### 4. Google Gemini（免費選項）

**獲取方式**：
1. 訪問 https://makersuite.google.com/app/apikey
2. 登錄 Google 帳號
3. 創建 API Key

**配置**：
```env
GOOGLE_GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxx
```

**費率**：
- 免費額度：1500 次/月
- 超出後：~$0.001/張

#### 5. OpenAI（音頻轉錄）

**獲取方式**：
1. 訪問 https://platform.openai.com/api-keys
2. 登錄或註冊
3. 創建 API Key
4. 添加充值

**配置**：
```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
```

**費率**：$0.006/分鐘

---

## 故障排除

### 常見錯誤

#### 錯誤 1: API Key 無效

```
❌ 錯誤: 401 Unauthorized
```

**解決**：
```bash
# 檢查環境變量
node -e "console.log(process.env.JINA_API_KEY)"

# 確認 .env 文件存在
cat .env

# 重新加載環境變量
source .env  # Linux/Mac
```

#### 錯誤 2: 向量維度不匹配

```
❌ expected 768 dimensions, not 1024
```

**解決**：
在向量化函數中設置：
```javascript
dimensions: 768  // 必須是 768
```

#### 錯誤 3: Rate Limit

```
❌ 429 Too Many Requests
```

**解決**：
```bash
# 減少批量大小
node process-all-media.js 50  # 而不是 100

# 或增加腳本中的延遲
# 修改 setTimeout 值從 1500 改為 3000
```

#### 錯誤 4: 文件未找到

```
❌ ENOENT: no such file or directory
```

**解決**：
```bash
# 檢查文件是否存在
ls -la data/media/

# 檢查路徑
pwd
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
```

#### 錯誤 5: 內存不足

```
❌ JavaScript heap out of memory
```

**解決**：
```bash
# 增加 Node.js 內存限制
NODE_OPTIONS="--max-old-space-size=4096" node script.js
```

### 檢查系統狀態

```bash
# 檢查數據庫連接
node -e "
const {createClient}=require('@supabase/supabase-js');
const s=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
s.from('whatsapp_messages').select('*').limit(1).then(r=>console.log(r.error?'❌':'✅'));
"

# 檢查 API 額度（OpenRouter）
curl https://openrouter.ai/api/v1/auth/key \
  -H "Authorization: Bearer $GEMINI_API_KEY"
```

---

## 成本參考

### 按功能計算

| 功能 | API | 單價 | 1000次 | 備註 |
|------|-----|------|--------|------|
| 圖片描述 | OpenRouter | $0.0002/張 | $0.20 | 推薦 |
| 圖片描述 | Gemini | 免費 | $0.00 | 1500/月 |
| OCR | OpenRouter | $0.0002/張 | $0.20 | 推薦 |
| 向量化 | Jina AI | $0.02/1M tokens | ~$0.01 | 必需 |
| 視頻分析 | Gemini | $0.01/視頻 | $10.00 | |
| 音頻轉錄 | OpenAI | $0.012/分鐘 | - | |
| 文檔處理 | 本地 | $0.00 | $0.00 | 免費 |

### 實際使用成本估算

**場景 1：個人使用（小規模）**
- 500 張圖片描述
- 500 張 OCR
- 向量化所有內容

**成本**：
- 圖片描述：500 × $0.0002 = $0.10
- OCR：500 × $0.0002 = $0.10
- 向量化：$0.01
- **總計：~$0.21**

**場景 2：完整處理（您的項目）**
- 1488 張圖片描述
- 1488 張 OCR
- 363 個音頻（平均 3 分鐘）
- 向量化所有內容

**成本**：
- 圖片描述：1488 × $0.0002 = $0.30
- OCR：1488 × $0.0002 = $0.30
- 音頻轉錄：363 × 3 × $0.006 = $6.53
- 向量化：$0.01
- **總計：~$7.14**

**場景 3：使用免費 API**
- 使用 Google Gemini（1500 次/月免費）
- 只處理文檔和 1500 張圖片

**成本**：
- 圖片描述：$0.00（免費額度內）
- 文檔處理：$0.00
- 向量化：$0.01
- **總計：~$0.01**

### 省錢技巧

1. **優先使用免費 API**
   ```bash
   # 使用 Gemini 而不是 OpenRouter
   node process-images-gemini.js 1500
   ```

2. **批量處理減少請求**
   ```javascript
   // 一次處理多個而不是單個
   await Promise.all(items.map(process))
   ```

3. **緩存結果避免重複**
   ```javascript
   // 檢查是否已處理
   if (已存在) return cached;
   ```

4. **選擇性處理**
   ```bash
   # 只處理重要內容
   node process-all-media.js 100  # 而不是全部
   ```

---

## 快速參考表

### 文件與命令對照

| 功能 | 腳本 | 命令 |
|------|------|------|
| 導入數據 | `import-whatsapp-zip.js` | `node import-whatsapp-zip.js <zip>` |
| 圖片描述 | `process-all-media.js` | `node process-all-media.js 100` |
| OCR | `ocr-with-embedding.js` | `node ocr-with-embedding.js 100` |
| 視頻處理 | `process-video-gemini.js` | `node process-video-gemini.js 50` |
| 音頻處理 | `process-audio-whisper.js` | `node process-audio-whisper.js 100` |
| 文檔處理 | `process-documents.js` | `node process-documents.js 100` |
| 向量化 | `embed-all-knowledge.js` | `node embed-all-knowledge.js` |
| 搜索 | `test-vector-search.js` | `node test-vector-search.js "關鍵詞"` |

### OCR 模式參考

| 模式 | 用途 | 輸出格式 | 示例 |
|------|------|----------|------|
| `general` | 通用文字提取 | 純文字 | 海報、標籤、說明 |
| `businessCard` | 名片識別 | JSON | 姓名、電話、郵箱 |
| `document` | 文檔提取 | Markdown | 報告、合同 |
| `receipt` | 收據/發票 | JSON | 商家、金額、日期 |
| `screenshot` | 截圖文字 | 純文字 | 聊天記錄截圖 |

### 環境變量速查

```env
# 必需
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
JINA_API_KEY=jina_...
GEMINI_API_KEY=sk-or-v1-...  # OpenRouter

# 可選
GOOGLE_GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-...
```

### 常用搜索示例

```bash
# 搜索活動
node test-vector-search.js "活動 event party"

# 搜索美食
node test-vector-search.js "餐廳 food 美食"

# 搜索文字內容
node test-vector-search.js "電話 email 地址"

# 搜索人物
node test-vector-search.js "自拍 合照 portrait"

# 搜索地點
node test-vector-search.js "香港 HK location"
```

---

## 📞 獲取幫助

### 檢查日誌

```bash
# 查看 OCR 處理日誌
cat ocr-processing.log

# 實時查看
tail -f ocr-processing.log

# 查看最後 100 行
tail -n 100 ocr-processing.log
```

### 調試模式

```bash
# 啟用詳細日誌
DEBUG=* node script.js

# 查看環境變量
env | grep -E "SUPABASE|JINA|GEMINI|OPENAI"
```

### 重置與清理

```bash
# 清理臨時文件
rm -rf temp/
rm -f *.log

# 重新安裝依賴
rm -rf node_modules package-lock.json
npm install

# 清理數據庫特定會話（謹慎使用）
# 在 Supabase 控制台執行 SQL：
# DELETE FROM rag_knowledge WHERE session_id = 'xxx';
```

---

## 🚀 進階使用

### 並行處理

```bash
# 同時處理圖片和 OCR（在不同終端）
# 終端 1
node process-all-media.js 500

# 終端 2
node ocr-with-embedding.js 500
```

### 定時任務

```bash
# 使用 cron 定時處理
# 編輯 crontab
crontab -e

# 每天凌晨 2 點處理新數據
0 2 * * * cd /path/to/whatsapp-crm && node process-all-media.js 100
```

### 備份數據

```bash
# 導出數據庫（在 Supabase 控制台）
# 或使用 pg_dump

# 備份媒體文件
tar -czf media-backup-$(date +%Y%m%d).tar.gz data/media/
```

---

**最後更新**：2026-02-09

**快速鏈接**：
- [完整文檔](README.md)
- [開發指南](DEVELOPMENT_GUIDE.md)
- [GitHub](https://github.com/your-repo)
