#!/bin/bash

# 快速同步脚本 - 一键部署到服务器

SERVER="whatsapp-crm.techforliving.app"
REMOTE_PATH="/home/ubuntu/whatsapp-crm"  # 根据实际情况修改
BRANCH="feature/gemini3"

echo "🚀 快速同步到服务器..."
echo ""

# 在服务器上执行
ssh $SERVER << EOF
    cd $REMOTE_PATH
    
    echo "📍 当前位置: \$(pwd)"
    echo "🔀 当前分支: \$(git branch --show-current)"
    echo ""
    
    echo "📥 拉取最新代码..."
    git fetch origin
    git pull origin $BRANCH
    
    echo ""
    echo "✅ 同步完成！"
    echo ""
    echo "📊 最新提交："
    git log -1 --oneline
    echo ""
EOF

echo "🎉 部署完成！"
