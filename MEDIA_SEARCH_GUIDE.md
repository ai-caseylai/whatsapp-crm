# 📎 多媒體附件搜索系統

## 🚀 一鍵處理所有附件

### 處理所有類型的附件（圖片、視頻、PDF、文檔、音頻等）

```bash
# 處理前 100 個附件（默認）
node process-all-media.js

# 處理前 50 個附件
node process-all-media.js 50

# 處理所有附件
node process-all-media.js 10000
```

## 支持的附件類型

| 類型 | 圖標 | 說明 | 處理方式 |
|------|------|------|----------|
| 圖片 | 🖼️ | image | AI Vision 分析內容 |
| 視頻 | 🎬 | video | AI Vision 分析縮圖/內容 |
| 文檔 | 📄 | document, pdf, doc, excel | 提取文件名和說明 |
| 音頻 | 🎵 | audio, ptt (語音消息) | 提取說明和元數據 |

## 🔍 統一搜索

### 搜索所有內容（對話 + 附件）

```bash
# 搜索所有內容
node search-all.js "帆船"

# 只搜索圖片
node search-all.js "風景照片" image

# 只搜索視頻
node search-all.js "比賽" video

# 只搜索文檔
node search-all.js "合約" document

# 只搜索音頻
node search-all.js "會議錄音" audio

# 只搜索對話
node search-all.js "討論" conversation
```

## 📊 處理流程

```
1. 掃描數據庫
   ├─ 圖片消息
   ├─ 視頻消息
   ├─ 文檔消息
   └─ 音頻消息

2. AI 分析
   ├─ 圖片/視頻 → Vision AI 生成描述
   └─ 文檔/音頻 → 提取文件信息

3. 向量化
   └─ 使用 Jina AI 生成 embeddings

4. 存入知識庫
   └─ 保存到 rag_knowledge 表
```

## ⚙️ 配置

### 環境變數（.env 文件）

```bash
# 必需
OPENROUTER_API_KEY=your_key_here    # 用於 Vision AI
JINA_API_KEY=your_key_here          # 用於向量化

# Session ID（在腳本中設置）
SESSION_ID=sess_id73sa6oi_1770363274857
```

### 模型配置

腳本默認使用 **Gemini 2.0 Flash (免費)** 進行圖片/視頻分析。

要切換模型，編輯 `process-all-media.js`:

```javascript
// 可選模型
const VISION_MODEL = 'google/gemini-2.0-flash-exp:free';  // 免費 ⭐
// const VISION_MODEL = 'anthropic/claude-3.5-haiku';     // $0.001/張
// const VISION_MODEL = 'anthropic/claude-3.5-sonnet';    // $0.015/張 (最高質量)
```

## 💰 成本估算

| 附件類型 | 處理成本 |
|----------|----------|
| 圖片 | 🆓 免費 (使用 Gemini 2.0 Flash) |
| 視頻 | 🆓 免費 (使用 Gemini 2.0 Flash) |
| 文檔 | 🆓 免費 (只提取文件名) |
| 音頻 | 🆓 免費 (只提取元數據) |
| 向量化 | 🆓 免費 (Jina AI 有免費額度) |

**處理 1000 個附件：約 $0 - $1 USD**（取決於模型選擇）

## 📝 使用示例

### 1. 處理所有附件

```bash
# 先處理少量測試
node process-all-media.js 10

# 確認沒問題後處理更多
node process-all-media.js 100
```

**輸出示例：**
```
============================================================
📎 多媒體附件處理與向量化
============================================================
🤖 Vision 模型: google/gemini-2.0-flash-exp:free
============================================================

步驟 1: 查找所有附件消息...

✅ 找到的附件統計:
   🖼️ image: 523 個
   🎬 video: 87 個
   📄 document: 45 個
   🎵 audio: 12 個
   總計: 667 個附件

...處理中...

🎉 多媒體附件處理完成！
✅ 已向量化 100 個附件
❌ 失敗 0 個
💡 現在可以使用語義搜索查詢所有附件內容
```

### 2. 搜索附件

```bash
# 搜索帆船相關的所有內容
node search-all.js "帆船"
```

**輸出示例：**
```
🔍 語義搜索: "帆船"
============================================================

步驟 1: 生成查詢向量...
✅ 查詢向量生成成功

步驟 2: 搜索相關內容...
✅ 找到 15 個相關結果

============================================================
📊 結果統計:
============================================================
💬 conversation: 8 個
🖼️ image: 5 個
🎬 video: 2 個
============================================================

🎯 搜索結果:
============================================================

1. 🖼️ IMAGE
   相似度: 92.3%
   來源: Kiasu L Sailing ⛵
   時間: 2026/2/7 下午3:18
   
   📝 AI 描述:
   圖片顯示一艘白色帆船在藍色海面上航行，
   帆上有紅色的標記...

2. 💬 CONVERSATION
   相似度: 88.5%
   來源: Kiasu L Sailing ⛵
   
   內容:
   [2026/2/7 下午2:00] MC Ho: 今天的帆船比賽很精彩...
```

### 3. 只搜索特定類型

```bash
# 只搜索圖片
node search-all.js "風景" image

# 只搜索文檔
node search-all.js "報告" document

# 只搜索視頻
node search-all.js "教學" video
```

## 🎯 實際應用場景

### 1. 尋找照片
```bash
node search-all.js "海邊照片" image
node search-all.js "美食照片" image
node search-all.js "合照" image
```

### 2. 尋找文檔
```bash
node search-all.js "合約" document
node search-all.js "報價單" document
node search-all.js "會議記錄" document
```

### 3. 尋找視頻
```bash
node search-all.js "教學視頻" video
node search-all.js "活動錄影" video
```

### 4. 綜合搜索
```bash
node search-all.js "項目資料"    # 搜索所有相關內容
node search-all.js "上次討論的"   # 包含對話和附件
```

## ⚠️ 注意事項

1. **首次處理建議先處理少量附件測試**
   ```bash
   node process-all-media.js 10
   ```

2. **Vision API 需要圖片 URL 可訪問**
   - 確保 media_url 有效
   - 如果 URL 過期，Vision 分析會失敗

3. **處理大量附件需要時間**
   - 100 個附件約需 5-10 分鐘
   - 腳本會自動處理 rate limit

4. **可以分批處理**
   ```bash
   node process-all-media.js 100  # 先處理 100 個
   # 等一段時間後再處理更多
   node process-all-media.js 200  # 處理前 200 個
   ```

## 🐛 故障排除

### 問題：找不到附件
```bash
# 檢查數據庫中的附件類型
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('your_url', 'your_key');
supabase.from('whatsapp_messages')
  .select('message_type', { count: 'exact' })
  .then(console.log);
"
```

### 問題：Vision API 失敗
- 確認 OPENROUTER_API_KEY 正確
- 檢查圖片 URL 是否可訪問
- 嘗試切換到其他模型

### 問題：搜索找不到結果
- 確認已運行處理腳本
- 檢查知識庫中的文檔數量
- 嘗試不同的搜索關鍵詞

## 📚 相關文件

- `process-all-media.js` - 主處理腳本
- `search-all.js` - 統一搜索腳本
- `process-images-openrouter.js` - 只處理圖片
- `search-images.js` - 只搜索圖片

## 🎉 完成！

現在你可以：
- ✅ 一鍵處理所有類型的附件
- ✅ 使用自然語言搜索任何內容
- ✅ 快速找到圖片、視頻、文檔、音頻
- ✅ 統一搜索對話和附件
