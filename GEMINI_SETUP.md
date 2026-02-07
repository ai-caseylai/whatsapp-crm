# Gemini 3 AI 助手設置說明

## 功能說明
右側新增了一個可縮放的 LLM 助手側邊欄，集成 Google Gemini 3 AI 模型。

## 使用方式
1. 點擊螢幕右側的切換按鈕（◀ 圖標）開啟/關閉側邊欄
2. 在輸入框輸入訊息與 AI 對話
3. 使用頂部的縮放按鈕調整側邊欄寬度
4. 點擊垃圾桶圖標清空對話記錄

## API Key 設置

### 步驟 1: 獲取 Gemini API Key
1. 訪問 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登入您的 Google 帳號
3. 點擊 "Create API Key" 創建新的 API Key
4. 複製生成的 API Key

### 步驟 2: 配置環境變量
在項目根目錄創建 `.env` 文件（如果不存在）：

```bash
# 從範例文件複製
cp .env.example .env
```

然後編輯 `.env` 文件，添加以下內容：

```bash
# Gemini API Configuration
GEMINI_API_KEY=你的_Gemini_API_Key

# GitHub Webhook Secret (保留原有配置)
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here

# Admin Panel Secret (保留原有配置)
ADMIN_SECRET=your-admin-secret-here
```

### 步驟 3: 重啟服務器
```bash
# 如果使用 PM2
pm2 restart all

# 或者直接重啟
npm start
```

## 技術細節

### 前端功能
- 可縮放側邊欄（300px - 800px）
- 即時對話顯示
- 聊天記錄管理
- 支援 Shift+Enter 換行

### 後端 API
- 端點: `POST /api/llm/chat`
- 模型: `gemini-2.0-flash-exp`
- 支援對話上下文記憶

### 請求格式
```json
{
  "message": "使用者輸入的訊息",
  "history": [
    { "role": "user", "parts": [{ "text": "..." }] },
    { "role": "model", "parts": [{ "text": "..." }] }
  ]
}
```

### 回應格式
```json
{
  "success": true,
  "reply": "AI 的回應內容",
  "model": "gemini-2.0-flash-exp"
}
```

## 故障排除

### API Key 無效
如果收到 "Gemini API 返回錯誤" 訊息：
1. 檢查 `.env` 文件中的 API Key 是否正確
2. 確認 API Key 在 Google AI Studio 中啟用
3. 檢查 API 配額是否已用完

### 連接失敗
如果顯示 "連接失敗"：
1. 檢查網絡連接
2. 確認服務器正常運行
3. 查看服務器日誌：`pm2 logs`

### 無回應
如果 AI 沒有回應：
1. 打開瀏覽器開發者工具查看 Console
2. 檢查 Network 標籤的 API 請求
3. 查看服務器端日誌

## 免費額度
Gemini API 提供免費額度：
- 每分鐘 15 次請求
- 每天 1,500 次請求
- 每月 100 萬 tokens

詳情請參考：https://ai.google.dev/pricing

## 未來改進方向
- [ ] 添加圖片上傳功能
- [ ] 支援語音輸入
- [ ] 保存對話記錄到數據庫
- [ ] 支援多種 AI 模型切換
- [ ] 添加對話導出功能
