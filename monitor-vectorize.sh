#!/bin/bash

# 實時監控向量化進度

while true; do
    clear
    echo "========================================"
    echo "📊 WhatsApp 數據向量化 - 實時進度"
    echo "========================================"
    echo ""
    
    # 檢查進程
    if pgrep -f "sync-vectorize-to-db.js" > /dev/null; then
        echo "✅ 進程狀態: 運行中"
    else
        echo "⚠️  進程狀態: 已完成或停止"
    fi
    
    echo ""
    echo "📝 最新進度（最後 15 行）:"
    echo "----------------------------------------"
    tail -15 sync-vectorize.log 2>/dev/null || echo "日誌文件不存在"
    echo "----------------------------------------"
    echo ""
    echo "🔄 自動刷新中... (Ctrl+C 退出)"
    
    # 如果進程已結束，顯示完成信息
    if ! pgrep -f "sync-vectorize-to-db.js" > /dev/null; then
        echo ""
        echo "✅ 向量化已完成！"
        echo "📊 查看完整日誌: cat sync-vectorize.log"
        break
    fi
    
    sleep 5
done
