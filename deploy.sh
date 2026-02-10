#!/bin/bash

# WhatsApp CRM v1.55.0 部署脚本

echo "🚀 开始部署 WhatsApp CRM v1.55.0..."

# 1. 上传文件到服务器
echo "📤 上传文件到服务器..."
rsync -avz \
    --exclude 'node_modules' \
    --exclude 'auth_info_baileys' \
    --exclude 'data' \
    --exclude '.git' \
    --exclude 'media' \
    --exclude '.env' \
    ./ lighthouse@whatsapp-crm.techforliving.app:/home/lighthouse/whatsapp-crm/

if [ $? -ne 0 ]; then
    echo "❌ 文件上传失败，请检查 SSH 连接"
    echo ""
    echo "💡 故障排查："
    echo "   1. 检查 SSH 密钥: ls -la ~/.ssh/"
    echo "   2. 添加密钥: ssh-add ~/.ssh/id_ed25519"
    echo "   3. 测试连接: ssh lighthouse@whatsapp-crm.techforliving.app \"echo OK\""
    echo ""
    echo "📖 详细说明请查看: DEPLOY_MANUAL_v1.55.0.md"
    exit 1
fi

echo "✅ 文件上传成功"

# 2. 重启服务
echo "🔄 重启 PM2 服务..."
ssh lighthouse@whatsapp-crm.techforliving.app "cd /home/lighthouse/whatsapp-crm && pm2 restart whatsapp-bot --update-env"

if [ $? -ne 0 ]; then
    echo "❌ 服务重启失败"
    exit 1
fi

echo "✅ 服务重启成功"
echo ""
echo "🎉 部署完成！版本：v1.55.0"
echo ""
echo "📝 更新内容："
echo "  v1.55.0: 改进 AI 助手对话历史保存"
echo "    - ✅ 对话记录自动保存到 localStorage"
echo "    - ✅ 刷新页面后自动恢复历史对话"
echo "    - ✅ 改进清空对话提示信息"
echo "    - ✅ 首次使用显示保存提示"
echo ""
echo "  v1.54.0: 改进头像加载调试"
echo "  v1.53.0: 修复联系人名称显示"
echo ""
echo "💡 验证步骤："
echo "  1. 打开 https://whatsapp-crm.techforliving.app"
echo "  2. 在 AI 助手中发送几条消息"
echo "  3. 刷新页面（Cmd+R）"
echo "  4. 验证历史对话是否恢复"
echo "  5. 点击「清空对话」按钮，检查新提示"
echo ""
echo "📖 详细说明: DEPLOY_MANUAL_v1.55.0.md"


