#!/bin/bash

# 交互式同步脚本

echo "╔════════════════════════════════════════════════════╗"
echo "║   WhatsApp CRM 服务器同步工具                      ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 询问服务器信息
read -p "请输入服务器地址 (默认: whatsapp-crm.techforliving.app): " SERVER
SERVER=${SERVER:-whatsapp-crm.techforliving.app}

read -p "请输入 SSH 用户名 (默认: ubuntu): " SSH_USER
SSH_USER=${SSH_USER:-ubuntu}

read -p "请输入项目路径 (默认: /home/$SSH_USER/whatsapp-crm): " REMOTE_PATH
REMOTE_PATH=${REMOTE_PATH:-/home/$SSH_USER/whatsapp-crm}

read -p "请输入 Git 分支 (默认: feature/gemini3): " BRANCH
BRANCH=${BRANCH:-feature/gemini3}

echo ""
echo "📋 配置信息："
echo "   服务器: $SSH_USER@$SERVER"
echo "   路径: $REMOTE_PATH"
echo "   分支: $BRANCH"
echo ""

read -p "确认开始同步？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消"
    exit 0
fi

echo ""
echo "🔍 测试 SSH 连接..."

# 测试连接
if ssh -o ConnectTimeout=5 -o BatchMode=yes $SSH_USER@$SERVER "echo '✅ SSH 连接成功'" 2>/dev/null; then
    echo "✅ SSH 连接正常"
else
    echo "⚠️  SSH 密钥认证失败，将使用密码认证"
    echo ""
fi

echo ""
echo "📥 开始同步代码..."
echo ""

# 同步代码
ssh $SSH_USER@$SERVER << EOF
    cd $REMOTE_PATH
    
    echo "📍 当前位置: \$(pwd)"
    echo "🔀 当前分支: \$(git branch --show-current)"
    echo ""
    
    echo "📥 拉取最新代码..."
    git fetch origin
    git pull origin $BRANCH
    
    if [ \$? -eq 0 ]; then
        echo ""
        echo "✅ 同步完成！"
        echo ""
        echo "📊 最新提交："
        git log -1 --pretty=format:"%h - %an, %ar : %s"
        echo ""
        echo ""
        echo "📝 文件变更统计："
        git diff --stat HEAD@{1} HEAD 2>/dev/null || echo "   无变更"
    else
        echo ""
        echo "❌ 同步失败"
        exit 1
    fi
EOF

if [ $? -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════╗"
    echo "║   🎉 部署完成！                                    ║"
    echo "╚════════════════════════════════════════════════════╝"
    echo ""
    echo "💡 后续操作："
    echo "   1. 重启服务: ssh $SSH_USER@$SERVER 'pm2 restart whatsapp-crm'"
    echo "   2. 查看日志: ssh $SSH_USER@$SERVER 'pm2 logs whatsapp-crm'"
    echo "   3. 查看状态: ssh $SSH_USER@$SERVER 'pm2 status'"
    echo ""
else
    echo ""
    echo "❌ 部署失败！请检查错误信息"
    exit 1
fi
