#!/bin/bash

# 檢查向量化進度的腳本

echo "========================================"
echo "📊 WhatsApp 數據向量化進度監控"
echo "========================================"
echo ""

# 檢查進程是否在運行
if pgrep -f "node full-vectorize.js" > /dev/null; then
    echo "✅ 向量化進程正在運行中..."
    echo ""
else
    echo "⚠️  向量化進程未運行"
    echo ""
fi

# 顯示最新日誌
echo "📝 最新日誌（最後 30 行）："
echo "----------------------------------------"
tail -30 vectorize.log
echo "----------------------------------------"
echo ""

# 檢查數據庫中的統計
echo "🔍 正在查詢數據庫統計..."
echo ""

# 顯示實時進度提示
echo "💡 提示："
echo "   - 使用 'tail -f vectorize.log' 查看實時日誌"
echo "   - 使用 'bash check-vectorize-progress.sh' 再次檢查進度"
echo "   - 向量化過程可能需要 5-10 分鐘"
echo ""
