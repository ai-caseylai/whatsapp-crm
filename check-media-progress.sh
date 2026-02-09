#!/bin/bash
# 檢查多媒體處理進度

echo "=========================================="
echo "📊 多媒體處理進度檢查"
echo "=========================================="
echo ""

# 檢查進程是否還在運行
if pgrep -f "node process-all-media.js" > /dev/null; then
    echo "✅ 處理進程正在運行中..."
    echo ""
else
    echo "⚠️  處理進程未運行"
    echo ""
fi

# 顯示日誌最後 30 行
if [ -f "media-processing.log" ]; then
    echo "📝 最新日誌（最後 30 行）："
    echo "=========================================="
    tail -n 30 media-processing.log
    echo "=========================================="
    echo ""
    
    # 統計進度
    total_processed=$(grep -c "✅ 完成" media-processing.log || echo "0")
    total_failed=$(grep -c "❌" media-processing.log || echo "0")
    
    echo "📈 當前統計："
    echo "   ✅ 已處理: $total_processed"
    echo "   ❌ 失敗: $total_failed"
    echo ""
    
    # 顯示預估完成時間
    if [ "$total_processed" -gt 0 ]; then
        target=1780
        remaining=$((target - total_processed))
        percent=$(awk "BEGIN {printf \"%.1f\", ($total_processed/$target)*100}")
        echo "   📊 進度: $percent% ($total_processed/$target)"
        echo "   ⏳ 剩餘: $remaining 個"
    fi
else
    echo "⚠️  找不到日誌文件 media-processing.log"
fi

echo ""
echo "💡 提示："
echo "   查看完整日誌: tail -f media-processing.log"
echo "   停止處理: pkill -f 'node process-all-media.js'"
echo "=========================================="
