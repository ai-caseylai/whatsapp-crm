# Gemini 3 图片编辑功能使用指南

## 🎨 功能簡介

本系統整合了 **Gemini 3 Pro Image Preview** (Nano Banana) 通過 Open Router 進行**任意圖片編輯**功能。

### ✨ 支持的編輯任務

- 🎨 **背景移除（摳圖）**
- ☀️ **亮度/對比度調整**
- ✂️ **裁剪和調整大小**
- ✨ **添加濾鏡效果**
- 🎭 **風格轉換**
- 🖼️ **其他任意圖片編輯指令**

### 工作流程

1. 從 WhatsApp 查看圖片訊息
2. 點擊圖片上的「AI 編輯」按鈕
3. 圖片自動發送到 Gemini 側邊欄
4. 在側邊欄輸入編輯指令（或點擊快捷按鈕）
5. Gemini 處理圖片並返回結果
6. 選擇發送到 WhatsApp、查看大圖或下載

## 📋 使用步驟

### 1. 配置 API Key

確保在 `.env` 文件或環境變量中設置了 Open Router API Key：

```bash
GEMINI_API_KEY=your-openrouter-api-key-here
```

### 2. 發送圖片到 Gemini

1. **打開聊天**：選擇包含圖片的聊天
2. **找到圖片**：定位到要編輯的圖片訊息
3. **點擊「AI 編輯」**：
   - 將鼠標懸停在圖片上
   - 右下角顯示藍紫色漸變的「AI 編輯」按鈕
   - 點擊按鈕

4. **圖片發送到 Gemini**：
   - Gemini 側邊欄自動打開（如果已關閉）
   - 圖片顯示在對話中，帶有預覽
   - 顯示快捷編輯按鈕

### 3. 編輯圖片

#### 方式 A：使用快捷按鈕

點擊預設的快捷按鈕：
- 🎨 **摳圖** - 移除背景
- ☀️ **提亮** - 提高亮度
- 🎭 **對比** - 增強對比度
- ✂️ **裁剪** - 裁剪成正方形
- ✨ **濾鏡** - 添加濾鏡效果

#### 方式 B：自定義指令

在輸入框中輸入任意編輯指令，例如：
- "將圖片轉換成黑白"
- "把主體放大並居中"
- "添加復古濾鏡效果"
- "調整飽和度到 150%"
- "將圖片旋轉 90 度"

### 4. 查看結果

處理完成後，Gemini 會顯示：
- ✅ 處理完成的提示
- 📷 編輯後的圖片預覽
- 三個操作按鈕：
  - **📤 發送到 WhatsApp** - 將編輯後的圖片發送回當前聊天
  - **🔍 查看大圖** - 在新標籤頁打開完整圖片
  - **💾 下載** - 下載到本地

## 🔧 技術實現

### API 端點

#### 1. 圖片編輯 API
```
POST /api/llm/edit-image
```

**請求體：**
```json
{
  "imagePath": "image_filename.jpg",
  "instruction": "移除背景",
  "history": []
}
```

**響應（成功編輯）：**
```json
{
  "success": true,
  "reply": "✅ 圖片編輯完成！",
  "processedImagePath": "edited_1234567890.png",
  "processedImageUrl": "/media/edited_1234567890.png",
  "originalImagePath": "image_filename.jpg"
}
```

**響應（僅文本）：**
```json
{
  "success": true,
  "reply": "我已經分析了圖片，建議先裁剪邊緣..."
}
```

#### 2. 發送圖片 API
```
POST /api/session/:id/send-image
```

**請求體：**
```json
{
  "remoteJid": "1234567890@s.whatsapp.net",
  "imagePath": "edited_1234567890.png",
  "caption": "✨ AI 編輯完成"
}
```

### 模型配置

- **模型**: `google/gemini-3-pro-image-preview` (Nano Banana)
- **API 提供商**: Open Router
- **Temperature**: 0.3 (平衡創意與準確性)
- **Max Tokens**: 16384
- **支持**: 圖片輸入 + 文本指令

### 前端實現

**圖片按鈕**：
```javascript
<button onclick="sendImageToGemini('path', 'url')" 
        class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100">
    AI 編輯
</button>
```

**核心函數**：
- `sendImageToGemini()` - 將圖片發送到側邊欄
- `quickEdit()` - 快捷編輯功能
- `sendLLMMessage()` - 處理編輯請求（支持圖片）
- `sendEditedImageToWhatsApp()` - 發送結果到 WhatsApp
- `downloadImage()` - 下載編輯後的圖片

## 💡 編輯指令示例

### 基礎編輯
```
- "移除背景"
- "提高亮度 20%"
- "增強對比度"
- "轉換為灰度"
- "裁剪成 1:1 比例"
```

### 進階編輯
```
- "添加溫暖的日落濾鏡"
- "將主體移到中心並模糊背景"
- "轉換成復古照片風格"
- "提高清晰度並減少噪點"
- "調整色溫使照片更冷色調"
```

### 創意編輯
```
- "將照片轉換成水彩畫風格"
- "添加淺景深效果，突出主體"
- "模仿電影海報的視覺效果"
- "創建雙色調效果（藍色和橙色）"
```

## ⚠️ 注意事項

### 1. API 限制
- Open Router 有請求頻率限制
- 圖片編輯通常需要 5-20 秒
- 複雜編輯可能需要更多 tokens

### 2. 圖片要求
- **支持格式**：JPG, PNG, WebP, GIF
- **建議分辨率**：不超過 4096x4096
- **文件大小**：建議小於 10MB
- **內容**：圖片內容清晰，主體明確

### 3. 編輯指令建議
- 使用清晰、具體的描述
- 一次只執行一個主要編輯任務
- 如果效果不理想，調整指令重試

### 4. 錯誤處理
- **429 錯誤**：請求過於頻繁，等待 1-2 分鐘
- **402 錯誤**：餘額不足，需要充值
- **401 錯誤**：API Key 無效或過期
- **處理失敗**：Gemini 可能返回文本建議而非編輯圖片

## 🎯 使用技巧

### 1. 獲得最佳效果
- 使用高質量原圖
- 指令要具體明確
- 對於複雜編輯，分步驟進行

### 2. 快速工作流程
1. 批量選擇要編輯的圖片
2. 使用快捷按鈕快速處理
3. 一鍵發送到 WhatsApp

### 3. 編輯歷史
- Gemini 會記住對話歷史
- 可以說"再亮一點"進行微調
- 支持連續編輯同一張圖片

## 🐛 調試

### 查看日誌

**後端日誌**：
```
🎨 調用 Gemini 3 進行圖片編輯...
📝 編輯指令: 移除背景
📦 Gemini 響應: {...}
📝 返回內容類型: string
✅ 圖片編輯完成，保存至: edited_1234567890.png
```

**前端日誌**（瀏覽器控制台）：
```
圖片已發送到 Gemini！請輸入編輯指令
🎨 處理中...
```

### 常見問題

**Q: 圖片沒有發送到 Gemini？**
A: 檢查圖片路徑是否正確，確認文件存在於 `/media/` 目錄。

**Q: Gemini 只返回文本，沒有編輯圖片？**
A: 某些指令 Gemini 會先給建議。嘗試更具體的編輯指令，或明確要求"請編輯圖片"。

**Q: 編輯效果不理想？**
A: 調整指令措辭，或使用"基於上一次結果，再..."進行微調。

**Q: 如何測試 API？**
A: 使用 curl 測試：

```bash
curl -X POST http://localhost:3000/api/llm/edit-image \
  -H "Content-Type: application/json" \
  -d '{
    "imagePath": "test.jpg",
    "instruction": "移除背景"
  }'
```

## 📊 版本歷史

- **v0.81** (2026-02-08)
  - ✨ 重構為通用圖片編輯功能
  - 🎨 圖片發送到 Gemini 側邊欄
  - 🚀 支持任意編輯指令
  - 🎯 添加快捷編輯按鈕
  - 📤 一鍵發送結果到 WhatsApp
  - 💾 支持下載編輯後的圖片
  - 🔄 支持連續編輯和歷史記憶

- **v0.80** (2026-02-08)
  - ✨ 初始版本：Nano Banana 背景移除

## 🔗 相關資源

- [Open Router 官網](https://openrouter.ai/)
- [Open Router 文檔](https://openrouter.ai/docs)
- [Gemini API 文檔](https://ai.google.dev/)
- [WhatsApp Baileys 庫](https://github.com/WhiskeySockets/Baileys)

---

**提示**：盡情發揮創意，嘗試各種編輯指令！Gemini 的圖片編輯能力非常強大。🎨
