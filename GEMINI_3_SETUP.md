# 🚀 Google Gemini 3 Pro Preview 配置成功！

系統已成功配置並使用 **Google Gemini 3 Pro Preview** 模型（通過 Open Router）。

---

## ✅ 當前配置

### 模型信息
- **模型名稱**: `google/gemini-3-pro-preview`
- **提供商**: Open Router
- **模型顯示**: Google Gemini 3 Pro Preview (via OpenRouter)
- **API Key**: `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`

### 性能參數
- **Max Tokens**: 8192（對話與分析）
- **Temperature**: 
  - 對話：0.9（更有創意）
  - 分析：0.7（更專注準確）

---

## 🎯 Gemini 3 Pro 特點

### 優勢
- ⚡ **速度快**：比 Gemini 2.0 更快的響應速度
- 🧠 **更智能**：增強的推理和理解能力
- 📝 **長上下文**：支持更長的對話歷史
- 🌐 **多語言**：優秀的繁體中文支持
- 💎 **高質量**：更準確的分析和回答

### 適用場景
1. ✅ **複雜對話**：多輪深度對話
2. ✅ **聊天分析**：智能分析 WhatsApp 對話
3. ✅ **客戶洞察**：提供商業建議和跟進策略
4. ✅ **情緒分析**：準確識別對話情緒
5. ✅ **標籤生成**：智能生成客戶標籤

---

## 💰 費用說明

### Open Router 計費
Gemini 3 Pro Preview 是 **付費模型**，按使用量計費：

| 項目 | 價格 |
|------|------|
| Input (輸入) | ~$0.001 / 1K tokens |
| Output (輸出) | ~$0.002 / 1K tokens |
| 平均對話成本 | $0.001 - $0.005 |
| 平均分析成本 | $0.002 - $0.01 |

**估算**：
- 每月 1000 次對話：約 $1-5 USD
- 每月 100 次分析：約 $0.2-1 USD

**查看餘額**：
- 訪問 [Open Router Dashboard](https://openrouter.ai/dashboard)
- 查看當前餘額和使用情況

---

## ⚙️ 錯誤處理

### 402 錯誤：餘額不足

**錯誤訊息**：
```
💳 餘額不足
Open Router 帳戶餘額不足，請充值。
```

**解決方案**：
1. 訪問 [Open Router Credits](https://openrouter.ai/credits)
2. 充值帳戶（最低 $5 USD）
3. 支持信用卡、PayPal 等支付方式

---

### 429 錯誤：請求頻率限制

**配額限制**：
- 取決於您的 Open Router 訂閱等級
- 免費/低級：10-20 次/分鐘
- 付費：更高配額

**解決方案**：
- 降低請求頻率
- 升級 Open Router 訂閱

---

### 404 錯誤：模型不可用

**可能原因**：
- 模型名稱錯誤
- 模型暫時下線
- 區域限制

**解決方案**：
1. 檢查模型名稱：`google/gemini-3-pro-preview`
2. 訪問 [Open Router Models](https://openrouter.ai/models) 查看可用模型
3. 如果模型下線，可切換到：
   - `google/gemini-2.0-flash-exp` (免費)
   - `google/gemini-pro` (付費)

---

## 🔄 切換模型

### 切換到免費模型

如果想節省成本，可以切換到免費模型：

**編輯 server.js**：
```javascript
// 找到兩處模型定義，修改為：
model: 'google/gemini-2.0-flash-exp'  // 免費模型
```

### 切換到其他付費模型

**推薦選項**：
- `anthropic/claude-3-sonnet` - Claude 3 Sonnet
- `openai/gpt-4-turbo` - GPT-4 Turbo
- `google/gemini-pro-1.5` - Gemini Pro 1.5

---

## 📊 使用建議

### 對話功能
- ✅ **頻率**：每條消息間隔 2-3 秒
- ✅ **長度**：支持長對話（建議 < 10 輪）
- ✅ **類型**：問答、諮詢、客服

### 分析功能
- ✅ **消息數量**：10-200 條消息
- ✅ **頻率**：每次分析間隔 5 秒
- ✅ **用途**：客戶洞察、商業決策

---

## 🧪 測試命令

### 測試對話功能
```bash
curl -X POST http://localhost:3000/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "請用繁體中文介紹你的能力", "history": []}'
```

### 測試分析功能
```bash
curl -X POST http://localhost:3000/api/llm/analyze-chat \
  -H "Content-Type: application/json" \
  -d '{
    "contactName": "測試客戶",
    "contactId": "test123",
    "messages": [
      {"sender": "客戶", "message": "你好，請問有什麼產品？"},
      {"sender": "我", "message": "您好！我們有多種產品可選。"},
      {"sender": "客戶", "message": "價格如何？"},
      {"sender": "我", "message": "價格從 $100 起。"}
    ]
  }'
```

---

## 📚 相關鏈接

- [Open Router 官網](https://openrouter.ai/)
- [Open Router 模型列表](https://openrouter.ai/models)
- [Open Router API 文檔](https://openrouter.ai/docs)
- [Gemini 3 Pro 介紹](https://deepmind.google/technologies/gemini/)

---

## ✨ 功能亮點

### 1. Gemini 助手側邊欄
- 📍 位置：聊天界面右側
- 💬 功能：實時對話，支持上下文
- 🎨 UI：現代化設計，流暢動畫

### 2. 一鍵聊天分析
- 📍 位置：Chat Header 的 📊 按鈕
- 📊 功能：智能分析當前對話
- 📋 輸出：摘要、情緒、標籤、建議等

### 3. 智能推薦
- 🏷️ 自動生成客戶標籤
- 💡 提供行動建議
- ⚠️ 標記重要提醒

---

**配置完成時間**：2026-02-08
**最後更新**：2026-02-08
**狀態**：✅ 正常運行

如有問題，請檢查：
1. 📋 服務器日誌：`tail -f server.log`
2. 💳 Open Router 餘額
3. 🌐 網絡連接狀態
