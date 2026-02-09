#!/bin/bash

# 快速同步脚本 - 使用 PEM 密钥
# 用法: ./sync-pem-quick.sh [PEM文件路径]

SERVER="whatsapp-crm.techforliving.app"
SSH_USER="ubuntu"
REMOTE_PATH="/home/ubuntu/whatsapp-crm"
BRANCH="feature/gemini3"

# PEM 文件路径（可以作为参数传入）
PEM_FILE="${1}"

# 如果没有指定 PEM 文件，尝试自动查找
if [ -z "$PEM_FILE" ]; then
    echo "🔍 查找 PEM 文件..."
    
    # 查找常见位置的 .pem 文件
    for location in ~/.ssh/*.pem ~/Downloads/*.pem ~/Documents/*.pem ./*.pem; do
        if [ -f "$location" ]; then
            PEM_FILE="$location"
            echo "✅ 找到 PEM 文件: $PEM_FILE"
            break
        fi
    done
    
    if [ -z "$PEM_FILE" ]; then
        echo "❌ 未找到 PEM 文件"
        echo ""
        echo "用法: $0 [PEM文件路径]"
        echo "例如: $0 ~/.ssh/my-key.pem"
        exit 1
    fi
fi

# 检查文件是否存在
if [ ! -f "$PEM_FILE" ]; then
    echo "❌ PEM 文件不存在: $PEM_FILE"
    exit 1
fi

# 修正权限
chmod 400 "$PEM_FILE" 2>/dev/null

echo "🚀 快速同步到服务器..."
echo ""
echo "📋 配置："
echo "   服务器: $SSH_USER@$SERVER"
echo "   PEM: $PEM_FILE"
echo "   路径: $REMOTE_PATH"
echo ""

# 同步代码
ssh -i "$PEM_FILE" -o StrictHostKeyChecking=no $SSH_USER@$SERVER << EOF
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
echo ""
echo "💡 重启服务: ssh -i \"$PEM_FILE\" $SSH_USER@$SERVER 'pm2 restart whatsapp-crm'"
