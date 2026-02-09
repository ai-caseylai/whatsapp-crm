#!/bin/bash

# WhatsApp 數據向量化 - 一鍵執行腳本

echo "========================================"
echo "🚀 WhatsApp 數據向量化 - 自動執行"
echo "========================================"
echo ""

# 檢查是否有必要的依賴
if ! command -v node &> /dev/null; then
    echo "❌ 錯誤: Node.js 未安裝"
    exit 1
fi

echo "📋 執行步驟："
echo "1. ✅ 檢查服務器狀態"
echo "2. ⏳ 檢查數據庫表"
echo "3. ⏳ 開始向量化"
echo ""

# 步驟 1: 檢查服務器
echo "🔍 檢查服務器狀態..."
if pgrep -f "node server.js" > /dev/null; then
    echo "✅ 服務器正在運行"
else
    echo "❌ 服務器未運行，請先啟動: node server.js"
    exit 1
fi
echo ""

# 步驟 2: 檢查數據庫表
echo "🔍 檢查數據庫表..."
node setup-rag-table.js

if [ $? -ne 0 ]; then
    echo ""
    echo "⚠️  數據庫表尚未創建"
    echo ""
    echo "📋 請執行以下操作："
    echo "1. 訪問 Supabase SQL Editor:"
    echo "   https://supabase.com/dashboard/project/izwdetsrqjepoxmocore/sql"
    echo ""
    echo "2. 複製並執行 create-rag-table.sql 中的 SQL"
    echo ""
    echo "3. 執行完成後，再次運行此腳本"
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "🚀 開始向量化處理"
echo "========================================"
echo ""

# 步驟 3: 執行向量化
echo "執行: node sync-vectorize-to-db.js"
echo "預計時間: 10-15 分鐘"
echo ""

node sync-vectorize-to-db.js

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "✅ 向量化完成！"
    echo "========================================"
    echo ""
    echo "📊 查看結果: node check-embeddings-status.js"
    echo "🌐 測試 RAG: http://localhost:3000/rag-demo.html"
    echo ""
else
    echo ""
    echo "❌ 向量化失敗，請檢查日誌"
    exit 1
fi
