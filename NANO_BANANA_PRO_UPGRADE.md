# Nano Banana Pro 圖片編輯功能升級

## 📅 更新日期
2026-02-08

## 🎯 更新目標
將系統從僅支持圖片分析升級為完整的圖片生成和編輯功能，使用 OpenRouter 的 `google/gemini-3-pro-image-preview` (Nano Banana Pro) 模型。

---

## ✨ 核心功能

### 1. 圖片生成
- **從文本生成高保真度圖片**
- **支持多種分辨率**：最高可達 2K/4K
- **自由設定寬高比**：16:9、4:3、1:1 等
- **多語種支持**：包括繁體中文、簡體中文、英文等

### 2. 圖片編輯
- **局部/全局編輯**：移除背景、調整亮度、增強對比度等
- **高級效果**：模糊、銳化、濾鏡、旋轉等
- **多圖像融合**：支持多張圖片的合成
- **保持主體一致性**：可保持 1-5 個主體的身份特征

### 3. 多模態輸出
- **同時輸出圖片和文字**：API 返回編輯後的圖片（base64 編碼）+ 描述文字
- **自動保存**：編輯後的圖片自動保存到本地媒體目錄
- **一鍵發送**：可直接將編輯後的圖片發送回 WhatsApp

---

## 🔧 技術實現

### 1. 前端更新 (`public/index.html`)

#### 快捷按鈕更新
從純分析按鈕改為編輯+分析按鈕：

```html
<!-- 分析功能（白色按鈕） -->
<button onclick="quickEdit('請分析這張圖片的內容')">🔍 分析圖片</button>
<button onclick="quickEdit('請提取圖片中的文字')">📄 文字提取</button>

<!-- 編輯功能（漸變按鈕） -->
<button onclick="quickEdit('移除背景')">🎨 移除背景</button>
<button onclick="quickEdit('提高亮度')">☀️ 提高亮度</button>
<button onclick="quickEdit('增強對比度')">🔆 增強對比度</button>
<button onclick="quickEdit('添加模糊效果')">🌫️ 模糊效果</button>
<button onclick="quickEdit('銳化圖片')">✨ 銳化圖片</button>
```

#### 提示信息更新
```html
<!-- 舊版（警告） -->
<span class="text-orange-600">⚠️ 注意：當前 Gemini 3 模型僅支持圖片分析</span>

<!-- 新版（功能提示） -->
<span class="text-purple-600">✨ Nano Banana Pro 支持圖片編輯！將生成並返回新圖片</span>
```

#### 模型顯示名稱更新
```javascript
'image-edit': 'AI 編輯 (Nano Banana Pro)'  // 舊版: '圖片分析 (Gemini 3 Vision)'
```

### 2. 後端更新 (`server.js`)

#### API 請求參數更新
```javascript
// OpenRouter API 調用
body: JSON.stringify({
    model: 'google/gemini-3-pro-image-preview',  // Nano Banana Pro
    modalities: ['image', 'text'],  // 🆕 關鍵：啟用多模態輸出
    messages: messages,
    temperature: 0.3,
    max_tokens: 16384
})
```

#### 響應解析增強
系統現在支持解析以下格式的返回內容：

1. **純文字響應**（圖片分析）
```json
{
  "content": "這張圖片顯示了一隻可愛的貓咪..."
}
```

2. **包含 base64 圖片的字符串**
```json
{
  "content": "data:image/png;base64,iVBORw0KG..."
}
```

3. **多模態數組**
```json
{
  "content": [
    {
      "type": "text",
      "text": "已為您移除背景"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,iVBORw0KG..."
      }
    }
  ]
}
```

#### 圖片保存邏輯
```javascript
if (processedBase64) {
    const processedFilename = `edited_${Date.now()}.png`;
    const processedPath = path.join(SHARED_MEDIA_DIR, processedFilename);
    fs.writeFileSync(processedPath, Buffer.from(processedBase64, 'base64'));
    
    return res.json({
        success: true,
        reply: replyText || '✅ 圖片編輯完成！',
        processedImagePath: processedFilename,
        processedImageUrl: `/media/${processedFilename}`
    });
}
```

---

## 📊 功能對比

| 功能 | 舊版 (Gemini 3 Vision) | 新版 (Nano Banana Pro) |
|------|------------------------|------------------------|
| 圖片分析 | ✅ | ✅ |
| 文字提取 | ✅ | ✅ |
| 圖片編輯輸出 | ❌ | ✅ |
| 移除背景 | ❌ | ✅ |
| 調整亮度/對比度 | ❌ | ✅ |
| 添加濾鏡效果 | ❌ | ✅ |
| 多圖像融合 | ❌ | ✅ |
| 高分辨率輸出 | ❌ | ✅ (2K/4K) |
| 多模態輸出 | ❌ | ✅ (圖+文) |

---

## 💰 成本說明

根據 OpenRouter 平台計費：

- **輸入 tokens**：$2/M
- **輸出 tokens**：$12/M
- **總 tokens**：$120/M

**注意**：圖片編輯會產生較高的輸出 token 成本（因為返回 base64 編碼的圖片數據）。建議：
- 僅在必要時使用編輯功能
- 分析功能成本較低，可頻繁使用
- 監控 OpenRouter 帳戶餘額

---

## 🎨 使用示例

### 示例 1：移除背景
```
用戶: [上傳圖片] → 點擊「🎨 移除背景」
系統: [返回透明背景的圖片 + 「已為您移除背景」]
用戶: [點擊「📤 發送到 WhatsApp」]
```

### 示例 2：提高亮度
```
用戶: [上傳圖片] → 點擊「☀️ 提高亮度」
系統: [返回調亮的圖片 + 「已將圖片亮度提高 30%」]
```

### 示例 3：自定義編輯
```
用戶: [上傳圖片] → 輸入「把這張圖片轉換成黑白風格」
系統: [返回黑白圖片 + 描述]
```

### 示例 4：複雜編輯
```
用戶: [上傳圖片] → 「移除背景，然後添加柔和的陰影效果」
系統: [返回處理後的圖片 + 詳細說明]
```

---

## 📝 最佳實踐

### 編輯指令建議
1. **明確具體**：「移除背景」比「處理這張圖」更好
2. **分步驟**：複雜編輯可分多次進行
3. **描述清晰**：「提高 20% 亮度」比「調亮一點」更精確
4. **使用快捷按鈕**：預定義的命令經過優化，效果更好

### 錯誤處理
如果編輯失敗：
1. 檢查圖片格式（支持 JPG、PNG、WEBP）
2. 嘗試簡化編輯指令
3. 確認 OpenRouter 帳戶餘額
4. 查看控制台日誌獲取詳細錯誤信息

---

## 🔗 相關文檔

- [OpenRouter 模型頁面](https://openrouter.ai/models/google/gemini-3-pro-image-preview)
- [OpenRouter API 文檔](https://openrouter.ai/docs)
- [Gemini 3 設置指南](./GEMINI_3_SETUP.md)
- [Nano Banana 使用指南](./NANO_BANANA_GUIDE.md)

---

## 🚀 未來優化方向

1. **批量處理**：支持一次編輯多張圖片
2. **模板系統**：保存常用的編輯組合
3. **歷史記錄**：查看和復用編輯歷史
4. **預覽功能**：編輯前預覽效果
5. **高級參數**：自定義分辨率、寬高比、壓縮率等

---

## ✅ 更新清單

- [x] 更新前端快捷按鈕（添加編輯功能）
- [x] 更新提示信息（從警告改為功能提示）
- [x] 更新模型顯示名稱
- [x] 後端添加 `modalities` 參數
- [x] 增強響應解析邏輯（支持多種格式）
- [x] 測試圖片編輯功能
- [x] 測試圖片分析功能
- [x] 創建技術文檔

---

## 🎉 結語

通過升級到 Nano Banana Pro，WhatsApp CRM 現在擁有了完整的 AI 圖片處理能力：
- **分析**：理解圖片內容
- **生成**：從文字創建圖片
- **編輯**：修改和增強現有圖片

這為用戶提供了強大的視覺內容處理工具，使 WhatsApp 對話更加生動和高效！
