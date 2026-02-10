#!/bin/bash

PEM_KEY="$HOME/.ssh/claw2.pem"
SERVER="whatsapp-crm.techforliving.app"
USER="ubuntu"
PROJECT_PATH="/home/ubuntu/whatsapp-bot"

echo "🔄 快速更新服务器代码..."

ssh -i "$PEM_KEY" "$USER@$SERVER" << 'ENDSSH'
cd /home/ubuntu/whatsapp-bot
rm -f find-sailing-groups.js
git pull origin feature/gemini3
pm2 restart whatsapp-bot --update-env
echo "✅ 更新完成！"
pm2 logs whatsapp-bot --lines 10 --nostream
ENDSSH

echo ""
echo "🎉 服务已更新并重启！"
