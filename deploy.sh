#!/bin/bash
# WhatsApp CRM 自动部署脚本

echo "========================================"
echo "WhatsApp CRM 自动部署"
echo "开始时间: $(date)"
echo "========================================"

# 进入项目目录
cd /home/ubuntu/whatsapp-bot

# 显示当前状态
echo ""
echo "📌 当前版本:"
git log -1 --oneline 2>/dev/null || echo "未知版本"

# 从 GitHub 拉取最新代码
echo ""
echo "📥 正在从 GitHub 拉取最新代码..."
git fetch origin main

# 检查是否有更新
LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "✅ 代码已是最新版本，无需更新"
    exit 0
fi

echo "🔄 发现新版本，准备更新..."
echo "   本地: ${LOCAL:0:7}"
echo "   远程: ${REMOTE:0:7}"

# 保存本地更改（如果有）
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "⚠️  检测到本地更改，正在保存..."
    git stash save "Auto-stash before deploy at $(date)"
fi

# 记录更新前的版本
OLD_VERSION=$(git rev-parse --short HEAD 2>/dev/null)

# 拉取最新代码
echo ""
echo "🔄 正在拉取代码..."
git pull origin main

# 记录更新后的版本
NEW_VERSION=$(git rev-parse --short HEAD 2>/dev/null)

# 显示更新日志
if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    echo ""
    echo "📝 更新内容:"
    git log --oneline ${OLD_VERSION}..${NEW_VERSION} 2>/dev/null || echo "无法获取更新日志"
fi

# 检查是否需要安装依赖
if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    if git diff ${OLD_VERSION}..${NEW_VERSION} --name-only 2>/dev/null | grep -q "package.json"; then
        echo ""
        echo "📦 检测到 package.json 更改，正在安装依赖..."
        npm install --production
    fi
fi

# 重启服务
echo ""
echo "🔄 正在重启服务..."
pm2 restart whatsapp-bot --update-env

# 检查是否需要重启管理服务和 Webhook
if [ "$OLD_VERSION" != "$NEW_VERSION" ]; then
    if git diff ${OLD_VERSION}..${NEW_VERSION} --name-only 2>/dev/null | grep -qE "(admin-server\.js|webhook-server\.js)"; then
        echo "🔄 检测到管理服务或 Webhook 更改，正在重启..."
        pm2 restart whatsapp-admin --update-env 2>/dev/null || echo "   (管理服务未运行，跳过)"
        pm2 restart whatsapp-webhook --update-env 2>/dev/null || echo "   (Webhook 服务未运行，跳过)"
    fi
fi

# 等待服务启动
sleep 3

# 检查服务状态
echo ""
echo "📊 服务状态:"
pm2 list

# 显示最新版本
echo ""
echo "✅ 部署完成！"
echo "📌 当前版本: $(git log -1 --oneline)"

echo ""
echo "========================================"
echo "部署完成时间: $(date)"
echo "========================================"

# 可选：发送通知（需要配置）
# curl -X POST "your-webhook-url" -d "{\"text\":\"WhatsApp CRM 已更新到版本 $NEW_VERSION\"}"
