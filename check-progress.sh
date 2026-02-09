#!/bin/bash
# 快速查看当前进度

# 从服务器日志中提取最新的进度信息
LATEST_PROGRESS=$(tail -1 server.log | grep -o '進度 [0-9]*/[0-9]* ([0-9.]*%)')

if [ -n "$LATEST_PROGRESS" ]; then
    echo "📊 当前进度: $LATEST_PROGRESS"
    
    # 提取数字
    CURRENT=$(echo "$LATEST_PROGRESS" | grep -o '[0-9]*' | head -1)
    TOTAL=$(echo "$LATEST_PROGRESS" | grep -o '[0-9]*' | tail -1)
    PERCENT=$(echo "$LATEST_PROGRESS" | grep -o '[0-9.]*%' | grep -o '[0-9.]*')
    
    # 计算剩余
    REMAINING=$((TOTAL - CURRENT))
    MINS_LEFT=$(echo "scale=0; $REMAINING * 0.7 / 60" | bc)
    
    echo "📈 已完成: $CURRENT / $TOTAL"
    echo "⏳ 剩余: $REMAINING 条"
    echo "⏰ 预计剩余时间: ~$MINS_LEFT 分钟"
else
    echo "⏳ 等待进度更新..."
fi

echo ""
echo "💡 使用 './monitor-progress.sh' 查看详细信息"
