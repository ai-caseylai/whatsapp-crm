#!/bin/bash

# OCR 進度監控腳本

echo "╔════════════════════════════════════════════════════╗"
echo "║         📊 OCR 處理進度監控                       ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 檢查日誌文件
if [ ! -f ocr-processing.log ]; then
    echo "❌ 處理日誌文件不存在"
    echo "   請先運行: node ocr-with-embedding.js 1718"
    exit 1
fi

# 提取統計信息
echo "📈 實時統計："
echo "─────────────────────────────────────────────────────"

# 計算總進度
total=$(grep -c "^\[.*\]" ocr-processing.log 2>/dev/null || echo "0")
success=$(grep -c "✅ 已保存到數據庫" ocr-processing.log 2>/dev/null || echo "0")
no_text=$(grep -c "ℹ️  無文字內容" ocr-processing.log 2>/dev/null || echo "0")
fail=$(grep -c "❌ OCR 失敗" ocr-processing.log 2>/dev/null || echo "0")

echo "✅ 成功提取: $success 張"
echo "ℹ️  無文字: $no_text 張"
echo "❌ 失敗: $fail 張"
echo "📊 已處理: $total 張"
echo ""

# 顯示最新進度
echo "📝 最新處理記錄："
echo "─────────────────────────────────────────────────────"
tail -n 15 ocr-processing.log
echo ""
echo "─────────────────────────────────────────────────────"
echo "💡 提示："
echo "   - 查看完整日誌: cat ocr-processing.log"
echo "   - 實時監控: tail -f ocr-processing.log"
echo "   - 重新檢查進度: ./check-ocr-progress.sh"
