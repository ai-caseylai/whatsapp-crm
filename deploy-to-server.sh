#!/bin/bash

# WhatsApp CRM 服务器部署脚本
# 用途：将最新代码同步到 whatsapp-crm.techforliving.app

echo "╔════════════════════════════════════════════════════╗"
echo "║   WhatsApp CRM 服务器部署脚本                      ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 配置
SERVER="whatsapp-crm.techforliving.app"
REMOTE_PATH="/home/ubuntu/whatsapp-crm"  # 根据实际情况修改
BRANCH="feature/gemini3"

echo "📋 部署配置："
echo "   服务器: $SERVER"
echo "   远程路径: $REMOTE_PATH"
echo "   分支: $BRANCH"
echo ""

# 步骤 1: 测试 SSH 连接
echo "🔍 步骤 1: 测试 SSH 连接..."
if ssh -o ConnectTimeout=5 $SERVER "echo '✅ SSH 连接成功'" 2>/dev/null; then
    echo "✅ SSH 连接正常"
else
    echo "❌ SSH 连接失败！"
    echo "💡 请检查："
    echo "   1. 服务器地址是否正确"
    echo "   2. SSH 密钥是否配置正确"
    echo "   3. 防火墙是否允许连接"
    exit 1
fi
echo ""

# 步骤 2: 检查远程目录
echo "🔍 步骤 2: 检查远程目录..."
ssh $SERVER "test -d $REMOTE_PATH && echo '✅ 目录存在' || echo '❌ 目录不存在'"
echo ""

# 步骤 3: 在服务器上拉取最新代码
echo "📥 步骤 3: 拉取最新代码..."
ssh $SERVER << 'ENDSSH'
    cd $REMOTE_PATH
    
    echo "   📍 当前目录: $(pwd)"
    echo "   🔀 当前分支: $(git branch --show-current)"
    echo ""
    
    echo "   ⬇️  拉取最新代码..."
    git fetch origin
    git pull origin $BRANCH
    
    if [ $? -eq 0 ]; then
        echo "   ✅ 代码更新成功"
    else
        echo "   ❌ 代码更新失败"
        exit 1
    fi
ENDSSH

if [ $? -ne 0 ]; then
    echo "❌ 部署失败！"
    exit 1
fi
echo ""

# 步骤 4: 安装依赖
echo "📦 步骤 4: 安装依赖..."
read -p "是否需要运行 npm install？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ssh $SERVER "cd $REMOTE_PATH && npm install"
    echo "   ✅ 依赖安装完成"
else
    echo "   ⏭️  跳过依赖安装"
fi
echo ""

# 步骤 5: 重启服务
echo "🔄 步骤 5: 重启服务..."
read -p "是否需要重启服务？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "   请选择重启方式："
    echo "   1) PM2 重启"
    echo "   2) systemd 重启"
    echo "   3) 手动重启（仅显示命令）"
    read -p "   选择 (1-3): " -n 1 -r RESTART_METHOD
    echo
    
    case $RESTART_METHOD in
        1)
            echo "   🔄 使用 PM2 重启..."
            ssh $SERVER "cd $REMOTE_PATH && pm2 restart whatsapp-crm"
            ;;
        2)
            echo "   🔄 使用 systemd 重启..."
            ssh $SERVER "sudo systemctl restart whatsapp-crm"
            ;;
        3)
            echo "   💡 手动重启命令："
            echo "      ssh $SERVER"
            echo "      cd $REMOTE_PATH"
            echo "      pm2 restart whatsapp-crm"
            echo "      # 或者"
            echo "      sudo systemctl restart whatsapp-crm"
            ;;
        *)
            echo "   ⏭️  跳过重启"
            ;;
    esac
else
    echo "   ⏭️  跳过服务重启"
fi
echo ""

# 步骤 6: 检查服务状态
echo "🔍 步骤 6: 检查服务状态..."
read -p "是否需要检查服务状态？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ssh $SERVER "cd $REMOTE_PATH && pm2 list | grep whatsapp-crm || systemctl status whatsapp-crm"
else
    echo "   ⏭️  跳过状态检查"
fi
echo ""

# 完成
echo "╔════════════════════════════════════════════════════╗"
echo "║   🎉 部署完成！                                    ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""
echo "📝 后续步骤："
echo "   1. 访问 https://whatsapp-crm.techforliving.app 测试"
echo "   2. 查看日志: ssh $SERVER 'cd $REMOTE_PATH && pm2 logs whatsapp-crm'"
echo "   3. 查看状态: ssh $SERVER 'cd $REMOTE_PATH && pm2 status'"
echo ""
