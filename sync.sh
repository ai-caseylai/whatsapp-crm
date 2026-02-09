#!/bin/bash

# 一键同步脚本 - 使用正确的配置
# 服务器: whatsapp-crm.techforliving.app
# 用户: ubuntu
# 路径: /home/ubuntu/whatsapp-bot
# PEM: ~/.ssh/claw2.pem

PEM_FILE="$HOME/.ssh/claw2.pem"
SERVER="whatsapp-crm.techforliving.app"
SSH_USER="ubuntu"
REMOTE_PATH="/home/ubuntu/whatsapp-bot"
BRANCH="feature/gemini3"

echo "🚀 WhatsApp CRM 一键同步"
echo ""

# 同步代码
ssh -i "$PEM_FILE" $SSH_USER@$SERVER << EOF
    cd $REMOTE_PATH
    
    echo "📍 位置: \$(pwd)"
    echo "🔀 分支: \$(git branch --show-current)"
    echo ""
    
    echo "📥 拉取最新代码..."
    git fetch origin
    git pull origin $BRANCH
    
    echo ""
    echo "✅ 同步完成！"
    echo ""
    echo "📊 最新提交: \$(git log -1 --oneline)"
EOF

echo ""
echo "🎉 部署完成！"
echo ""
echo "💡 重启服务: ssh -i $PEM_FILE $SSH_USER@$SERVER 'pm2 restart whatsapp-bot'"
