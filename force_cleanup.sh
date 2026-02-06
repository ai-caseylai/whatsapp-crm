#!/bin/bash

echo "=========================================="
echo "🧹 强制清理失效会话"
echo "=========================================="
echo ""

# 连接到服务器
ssh -i ~/.ssh/claw2.pem ubuntu@whatsapp-crm.techforliving.app << 'EOF'

cd /home/ubuntu/whatsapp-bot

echo "1️⃣  停止服务..."
pm2 stop whatsapp-bot
echo ""

echo "2️⃣  删除所有本地会话文件..."
rm -rf data/sess_*
rm -rf auth_sessions/sess_*
echo "✅ 本地文件已清理"
echo ""

echo "3️⃣  查看清理后的文件..."
ls -la data/
echo ""

echo "4️⃣  启动服务..."
pm2 start whatsapp-bot
echo ""

echo "5️⃣  等待 10 秒让服务启动..."
sleep 10
echo ""

echo "6️⃣  查看启动日志..."
pm2 logs whatsapp-bot --lines 20 --nostream
echo ""

echo "=========================================="
echo "✨ 清理完成！"
echo "=========================================="

EOF
