#!/bin/bash

echo "🚀 啟動 WhatsApp CRM - Gemini 3 分支"
echo "=================================="

# 檢查 node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 正在安裝依賴..."
    npm install
fi

# 檢查 .env 文件
if [ ! -f ".env" ]; then
    echo "⚠️  警告: 未找到 .env 文件"
    echo "📝 創建默認 .env 文件..."
    cat > .env << 'EOF'
# Gemini API Configuration
GEMINI_API_KEY=your-gemini-api-key-here

# GitHub Webhook Secret
GITHUB_WEBHOOK_SECRET=your-webhook-secret-here

# Admin Panel Secret
ADMIN_SECRET=your-admin-secret-here
EOF
    echo "✅ 已創建 .env 文件，請編輯並添加你的 Gemini API Key"
    echo ""
fi

echo "🌐 啟動服務器..."
echo "📍 URL: http://localhost:3000"
echo "🤖 Gemini 3 助手已啟用（記得配置 API Key）"
echo ""
echo "按 Ctrl+C 停止服務器"
echo "=================================="
echo ""

node server.js
