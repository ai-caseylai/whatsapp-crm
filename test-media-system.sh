#!/bin/bash
# 多媒體附件處理與搜索 - 快速測試

echo "=================================="
echo "📎 多媒體附件處理系統 - 快速測試"
echo "=================================="
echo ""

# 檢查環境變數
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo "❌ 缺少 OPENROUTER_API_KEY"
    echo "請在 .env 文件中添加"
    exit 1
fi

if [ -z "$JINA_API_KEY" ]; then
    echo "❌ 缺少 JINA_API_KEY"
    echo "請在 .env 文件中添加"
    exit 1
fi

echo "✅ 環境變數檢查通過"
echo ""

# 步驟 1: 處理 10 個附件作為測試
echo "步驟 1: 處理 10 個附件（測試）..."
echo "=================================="
node process-all-media.js 10

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ 處理失敗"
    exit 1
fi

echo ""
echo "✅ 處理完成！"
echo ""

# 步驟 2: 測試搜索
echo "步驟 2: 測試搜索功能..."
echo "=================================="
echo ""

echo "🔍 搜索: 帆船"
node search-all.js "帆船"

echo ""
echo "=================================="
echo "✅ 測試完成！"
echo ""
echo "接下來你可以："
echo "1. 處理更多附件: node process-all-media.js 100"
echo "2. 搜索內容: node search-all.js \"你的關鍵詞\""
echo "3. 搜索特定類型: node search-all.js \"關鍵詞\" image"
echo ""
