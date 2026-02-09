# WhatsApp CRM 系統文檔索引

## 📚 文檔列表

本項目提供以下完整文檔：

### 1. 📖 [README.md](README.md) - 主文檔
**適合**: 所有用戶

**內容包括**:
- ✅ 系統概述與特點
- ✅ 核心功能詳解
- ✅ 快速開始指南
- ✅ 完整使用說明
- ✅ 技術架構說明
- ✅ API 參考
- ✅ 故障排除
- ✅ 成本分析

**何時閱讀**: 第一次使用系統或需要全面了解功能時

---

### 2. 🛠️ [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) - 開發指南
**適合**: 開發者、技術人員

**內容包括**:
- ✅ 開發環境設置
- ✅ 架構設計詳解
- ✅ 核心模塊源碼解析
- ✅ API 集成詳細說明
- ✅ 數據庫操作指南
- ✅ 擴展開發教程
- ✅ 測試指南
- ✅ 部署指南
- ✅ 最佳實踐

**何時閱讀**: 需要修改代碼、添加功能或深入了解技術實現時

---

### 3. ⚡ [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - 快速參考
**適合**: 日常使用者

**內容包括**:
- ✅ 常用命令速查
- ✅ API 密鑰獲取指南
- ✅ 故障排除快速解決
- ✅ 成本速查表
- ✅ 快速參考表格

**何時閱讀**: 需要快速查找命令或解決問題時

---

### 4. 🔍 [OCR_IMPLEMENTATION_GUIDE.md](OCR_IMPLEMENTATION_GUIDE.md) - OCR 實現指南
**適合**: 需要使用 OCR 功能的用戶

**內容包括**:
- ✅ OCR 功能概述
- ✅ 方案對比（Gemini、Tesseract、GPT-4等）
- ✅ 實現代碼詳解
- ✅ 使用方法
- ✅ 成本估算
- ✅ 進階功能

**何時閱讀**: 需要從圖片中提取文字時

---

### 5. 👤 [FACE_RECOGNITION_GUIDE.md](FACE_RECOGNITION_GUIDE.md) - 人臉識別指南
**適合**: 需要人臉識別功能的用戶

**內容包括**:
- ✅ 人臉識別方案說明
- ✅ AWS Rekognition 使用指南
- ✅ Azure Face API 使用指南
- ✅ 本地方案（face-api.js）
- ✅ 實現代碼示例

**何時閱讀**: 需要識別和搜索特定人物時

---

## 🎯 根據需求選擇文檔

### 我想快速開始使用

1. 閱讀 [README.md](README.md) 的「快速開始」部分
2. 參考 [QUICK_REFERENCE.md](QUICK_REFERENCE.md) 的常用命令
3. 開始處理數據

### 我想了解系統功能

1. 閱讀 [README.md](README.md) 的「核心功能」部分
2. 查看「使用指南」中的場景示例
3. 參考「技術架構」了解實現原理

### 我想使用特定功能

| 功能 | 參考文檔 |
|------|----------|
| 圖片描述 | README.md - 圖片描述生成 |
| OCR 文字提取 | OCR_IMPLEMENTATION_GUIDE.md |
| 人臉識別 | FACE_RECOGNITION_GUIDE.md |
| 向量搜索 | README.md - 智能搜索 |
| 音頻轉錄 | README.md - 音頻轉錄 |
| 文檔處理 | README.md - 文檔處理 |

### 我想修改或擴展系統

1. 閱讀 [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) 完整內容
2. 參考「擴展開發」部分
3. 查看「最佳實踐」

### 我遇到了問題

1. 查看 [QUICK_REFERENCE.md](QUICK_REFERENCE.md) 的「故障排除」
2. 參考 [README.md](README.md) 的「故障排除」部分
3. 檢查日誌文件（`*.log`）

### 我想優化成本

1. 閱讀 [README.md](README.md) 的「成本分析」
2. 查看 [QUICK_REFERENCE.md](QUICK_REFERENCE.md) 的「成本參考」
3. 參考「省錢技巧」部分

---

## 📊 文檔特點對比

| 文檔 | 長度 | 深度 | 適合場景 |
|------|------|------|----------|
| README.md | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 全面了解 |
| DEVELOPMENT_GUIDE.md | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 深入開發 |
| QUICK_REFERENCE.md | ⭐⭐ | ⭐ | 快速查詢 |
| OCR_IMPLEMENTATION_GUIDE.md | ⭐⭐⭐ | ⭐⭐⭐ | OCR 專題 |
| FACE_RECOGNITION_GUIDE.md | ⭐⭐⭐ | ⭐⭐⭐ | 人臉識別 |

---

## 🔗 相關資源

### 外部文檔鏈接

- [Supabase 文檔](https://supabase.com/docs)
- [Jina AI 文檔](https://jina.ai/docs)
- [OpenRouter 文檔](https://openrouter.ai/docs)
- [Google Gemini 文檔](https://ai.google.dev/docs)
- [OpenAI 文檔](https://platform.openai.com/docs)

### 代碼示例

所有主要功能都有對應的可執行腳本：

```
whatsapp-crm/
├── import-whatsapp-zip.js         # 數據導入示例
├── process-all-media.js           # 圖片處理示例
├── ocr-with-embedding.js          # OCR 示例
├── test-vector-search.js          # 搜索示例
└── embed-all-knowledge.js         # 向量化示例
```

---

## 📝 文檔更新記錄

### 2026-02-09
- ✅ 創建完整的 README.md
- ✅ 創建 DEVELOPMENT_GUIDE.md
- ✅ 創建 QUICK_REFERENCE.md
- ✅ 創建 DOCS_INDEX.md（本文件）
- ✅ 已有 OCR_IMPLEMENTATION_GUIDE.md
- ✅ 已有 FACE_RECOGNITION_GUIDE.md

### 文檔覆蓋率

✅ **系統概述**: 100%  
✅ **功能說明**: 100%  
✅ **使用指南**: 100%  
✅ **開發文檔**: 100%  
✅ **API 參考**: 100%  
✅ **故障排除**: 100%  
✅ **成本分析**: 100%  

---

## 💡 閱讀建議

### 新用戶路徑

```
1. QUICK_REFERENCE.md (10分鐘)
   ↓
2. README.md - 快速開始 (20分鐘)
   ↓
3. README.md - 核心功能 (30分鐘)
   ↓
4. 開始實際使用
```

### 開發者路徑

```
1. README.md - 完整閱讀 (1小時)
   ↓
2. DEVELOPMENT_GUIDE.md - 架構設計 (30分鐘)
   ↓
3. DEVELOPMENT_GUIDE.md - 核心模塊 (1小時)
   ↓
4. 查看實際代碼並開始開發
```

### 問題解決路徑

```
1. QUICK_REFERENCE.md - 故障排除 (5分鐘)
   ↓
2. README.md - 故障排除 (10分鐘)
   ↓
3. 檢查日誌和錯誤信息
   ↓
4. DEVELOPMENT_GUIDE.md - 調試指南 (如需深入)
```

---

## 🔍 搜索功能

### 如何在文檔中快速查找

```bash
# 在所有文檔中搜索關鍵詞
grep -r "OCR" *.md

# 在特定文檔中搜索
grep "向量化" README.md

# 查找命令示例
grep "node " QUICK_REFERENCE.md
```

### 常見查找關鍵詞

- `OCR` - 文字識別相關
- `embedding` / `向量化` - 向量搜索相關
- `API Key` - API 配置相關
- `error` / `錯誤` - 故障排除相關
- `cost` / `成本` - 費用相關
- `node ` - 命令示例

---

## 📞 支持與反饋

如果文檔中有任何不清楚或缺失的內容，歡迎反饋！

**文檔維護**: WhatsApp CRM Team  
**最後更新**: 2026-02-09

---

## 🎓 學習路線圖

### 初級用戶（1-2小時）
- [ ] 閱讀 QUICK_REFERENCE.md
- [ ] 了解基本命令
- [ ] 完成第一次數據導入
- [ ] 嘗試圖片處理
- [ ] 進行簡單搜索

### 中級用戶（4-6小時）
- [ ] 完整閱讀 README.md
- [ ] 理解所有功能模塊
- [ ] 使用 OCR 功能
- [ ] 處理多種媒體類型
- [ ] 優化處理流程

### 高級用戶（10+ 小時）
- [ ] 閱讀 DEVELOPMENT_GUIDE.md
- [ ] 理解架構設計
- [ ] 修改和擴展功能
- [ ] 優化性能和成本
- [ ] 貢獻代碼和文檔

---

**開始閱讀**: [README.md](README.md) | [快速參考](QUICK_REFERENCE.md)
