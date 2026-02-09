#!/bin/bash
# 統一處理所有類型的多媒體附件

echo "=========================================="
echo "🚀 WhatsApp 多媒體全類型處理"
echo "=========================================="
echo ""

# 檢查環境變數
if [ ! -f .env ]; then
    echo "❌ 錯誤: 找不到 .env 文件"
    exit 1
fi

# 讀取 .env
source .env

echo "📋 將要處理的類型："
echo "   🖼️  圖片（使用 Qwen VL Max）"
echo "   🎬 視頻（使用 Gemini 1.5 Pro）"
echo "   🎤 音頻（使用 OpenAI Whisper）"
echo "   📄 文檔（PDF、Word、Excel - 免費）"
echo ""

# 詢問用戶要處理哪些類型
echo "請選擇要處理的類型（可多選，用空格分隔）："
echo "  1) 圖片"
echo "  2) 視頻"
echo "  3) 音頻"
echo "  4) 文檔"
echo "  5) 全部"
echo ""
read -p "請輸入選項 (1-5): " choice

echo ""
echo "=========================================="

# 處理圖片
process_images() {
    echo ""
    echo "🖼️  處理圖片..."
    echo "=========================================="
    read -p "要處理多少張圖片？(回車處理全部): " image_count
    if [ -z "$image_count" ]; then
        image_count=2000
    fi
    
    echo "開始處理 $image_count 張圖片..."
    nohup node process-all-media.js $image_count > logs/images.log 2>&1 &
    echo "✅ 圖片處理已在後台啟動，日誌: logs/images.log"
}

# 處理視頻
process_videos() {
    echo ""
    echo "🎬 處理視頻..."
    echo "=========================================="
    read -p "要處理多少個視頻？(回車處理全部): " video_count
    if [ -z "$video_count" ]; then
        video_count=100
    fi
    
    echo "開始處理 $video_count 個視頻..."
    nohup node process-video-gemini.js $video_count > logs/videos.log 2>&1 &
    echo "✅ 視頻處理已在後台啟動，日誌: logs/videos.log"
}

# 處理音頻
process_audio() {
    echo ""
    echo "🎤 處理音頻..."
    echo "=========================================="
    read -p "要處理多少個音頻？(回車處理全部): " audio_count
    if [ -z "$audio_count" ]; then
        audio_count=200
    fi
    
    echo "開始處理 $audio_count 個音頻..."
    nohup node process-audio-whisper.js $audio_count > logs/audio.log 2>&1 &
    echo "✅ 音頻處理已在後台啟動，日誌: logs/audio.log"
}

# 處理文檔
process_documents() {
    echo ""
    echo "📄 處理文檔..."
    echo "=========================================="
    read -p "要處理多少個文檔？(回車處理全部): " doc_count
    if [ -z "$doc_count" ]; then
        doc_count=200
    fi
    
    echo "開始處理 $doc_count 個文檔..."
    node process-documents.js $doc_count
    echo "✅ 文檔處理完成"
}

# 創建日誌目錄
mkdir -p logs

# 根據用戶選擇處理
case $choice in
    1)
        process_images
        ;;
    2)
        process_videos
        ;;
    3)
        process_audio
        ;;
    4)
        process_documents
        ;;
    5)
        echo "處理全部類型..."
        process_images
        process_videos
        process_audio
        process_documents
        ;;
    *)
        echo "❌ 無效選項"
        exit 1
        ;;
esac

echo ""
echo "=========================================="
echo "✅ 處理已啟動！"
echo "=========================================="
echo ""
echo "📊 查看進度："
echo "   圖片: tail -f logs/images.log"
echo "   視頻: tail -f logs/videos.log"
echo "   音頻: tail -f logs/audio.log"
echo ""
echo "🛑 停止處理："
echo "   pkill -f 'node process-'"
echo "=========================================="
