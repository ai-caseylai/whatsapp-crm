#!/bin/bash

# WhatsApp CRM - OCR 快速測試腳本

echo "╔════════════════════════════════════════════════════╗"
echo "║         🔍 WhatsApp CRM - OCR 快速測試            ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 檢查是否有 GOOGLE_GEMINI_API_KEY
if [ -z "$GOOGLE_GEMINI_API_KEY" ]; then
    if [ -f .env ]; then
        source .env
    fi
    
    if [ -z "$GOOGLE_GEMINI_API_KEY" ]; then
        echo "❌ 錯誤: 缺少 GOOGLE_GEMINI_API_KEY"
        echo "請在 .env 文件中添加: GOOGLE_GEMINI_API_KEY=你的密鑰"
        echo "獲取方式: https://makersuite.google.com/app/apikey"
        exit 1
    fi
fi

echo "✅ API Key 已配置"
echo ""

# 檢查是否安裝依賴
if ! npm list @google/generative-ai > /dev/null 2>&1; then
    echo "📦 安裝依賴..."
    npm install @google/generative-ai
    echo ""
fi

# 選擇測試方式
echo "請選擇測試方式："
echo "1. 測試單張圖片"
echo "2. 批量處理 10 張"
echo "3. 批量處理 50 張"
echo "4. 批量處理全部"
echo ""
read -p "請輸入選項 (1-4): " choice

case $choice in
    1)
        read -p "請輸入圖片路徑: " image_path
        if [ -z "$image_path" ]; then
            # 自動找一張圖片測試
            image_path=$(find data/media -name "*.jpg" -o -name "*.png" | head -n 1)
            echo "使用測試圖片: $image_path"
        fi
        node ocr-gemini.js test "$image_path"
        ;;
    2)
        echo ""
        echo "開始處理 10 張圖片..."
        node ocr-gemini.js 10
        ;;
    3)
        echo ""
        echo "開始處理 50 張圖片..."
        node ocr-gemini.js 50
        ;;
    4)
        echo ""
        read -p "⚠️  這將處理所有圖片，可能需要較長時間。確定嗎？(y/n): " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            node ocr-gemini.js 1718
        else
            echo "已取消"
        fi
        ;;
    *)
        echo "❌ 無效選項"
        exit 1
        ;;
esac

echo ""
echo "✅ 完成！"
