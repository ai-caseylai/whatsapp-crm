#!/bin/bash
# 监控向量化进度

echo "========================================="
echo "向量化进度监控"
echo "========================================="
echo ""

# 检查进程是否在运行
if pgrep -f "full-vectorize.js" > /dev/null; then
    echo "✅ 向量化进程正在运行"
else
    echo "❌ 向量化进程未运行"
fi

echo ""
echo "📊 最新日志 (最后 30 行):"
echo "-----------------------------------------"
tail -30 vectorize.log

echo ""
echo "-----------------------------------------"
echo "💡 提示:"
echo "  - 预计总时间: ~70 分钟 (6144 条 × 0.7 秒/条)"
echo "  - 速率: ~85 条/分钟"
echo "  - 使用 'tail -f vectorize.log' 实时查看进度"
echo "  - 使用 'tail -f server.log | grep 进度' 查看详细进度"
