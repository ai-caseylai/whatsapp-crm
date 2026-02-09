#!/bin/bash

# 检查服务器环境配置脚本

PEM_KEY="$HOME/.ssh/claw2.pem"
SERVER="whatsapp-crm.techforliving.app"
USER="ubuntu"
PROJECT_PATH="/home/ubuntu/whatsapp-bot"

echo "🔍 检查服务器环境配置..."
echo ""

echo "1️⃣ 检查 .env 文件是否存在"
ssh -i "$PEM_KEY" "$USER@$SERVER" "ls -la $PROJECT_PATH/.env"
echo ""

echo "2️⃣ 检查 GEMINI_API_KEY 配置"
ssh -i "$PEM_KEY" "$USER@$SERVER" "grep 'GEMINI_API_KEY' $PROJECT_PATH/.env"
echo ""

echo "3️⃣ 检查 JINA_API_KEY 配置"
ssh -i "$PEM_KEY" "$USER@$SERVER" "grep 'JINA_API_KEY' $PROJECT_PATH/.env"
echo ""

echo "4️⃣ 检查 PM2 进程状态"
ssh -i "$PEM_KEY" "$USER@$SERVER" "pm2 list"
echo ""

echo "5️⃣ 检查最近的错误日志"
ssh -i "$PEM_KEY" "$USER@$SERVER" "pm2 logs whatsapp-bot --lines 30 --nostream | tail -50"
echo ""

echo "✅ 检查完成！"
