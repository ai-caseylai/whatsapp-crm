#!/bin/bash

# 使用 PEM 密钥文件同步到服务器

echo "╔════════════════════════════════════════════════════╗"
echo "║   WhatsApp CRM 服务器同步（PEM 密钥）              ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# 配置
SERVER="whatsapp-crm.techforliving.app"
SSH_USER="ubuntu"
REMOTE_PATH="/home/ubuntu/whatsapp-crm"
BRANCH="feature/gemini3"

# 查找 PEM 文件
echo "🔍 查找 PEM 密钥文件..."
echo ""

# 常见的 PEM 文件位置
PEM_LOCATIONS=(
    ~/.ssh/*.pem
    ~/Downloads/*.pem
    ~/Documents/*.pem
    ./*.pem
)

PEM_FILES=()
for location in "${PEM_LOCATIONS[@]}"; do
    for file in $location; do
        if [ -f "$file" ]; then
            PEM_FILES+=("$file")
        fi
    done
done

if [ ${#PEM_FILES[@]} -eq 0 ]; then
    echo "❌ 未找到 PEM 文件"
    echo ""
    echo "请手动指定 PEM 文件路径："
    read -p "PEM 文件路径: " PEM_FILE
    
    if [ ! -f "$PEM_FILE" ]; then
        echo "❌ 文件不存在: $PEM_FILE"
        exit 1
    fi
elif [ ${#PEM_FILES[@]} -eq 1 ]; then
    PEM_FILE="${PEM_FILES[0]}"
    echo "✅ 找到 PEM 文件: $PEM_FILE"
else
    echo "找到多个 PEM 文件，请选择："
    echo ""
    for i in "${!PEM_FILES[@]}"; do
        echo "  $((i+1))) ${PEM_FILES[$i]}"
    done
    echo ""
    read -p "请选择 (1-${#PEM_FILES[@]}): " selection
    PEM_FILE="${PEM_FILES[$((selection-1))]}"
    echo "✅ 已选择: $PEM_FILE"
fi

echo ""

# 检查 PEM 文件权限
PERMS=$(stat -f "%Lp" "$PEM_FILE" 2>/dev/null || stat -c "%a" "$PEM_FILE" 2>/dev/null)
if [ "$PERMS" != "400" ] && [ "$PERMS" != "600" ]; then
    echo "⚠️  PEM 文件权限不正确 (当前: $PERMS)"
    echo "🔧 正在修正权限为 400..."
    chmod 400 "$PEM_FILE"
    echo "✅ 权限已修正"
fi

echo ""
echo "📋 连接信息："
echo "   用户: $SSH_USER"
echo "   服务器: $SERVER"
echo "   PEM 文件: $PEM_FILE"
echo "   项目路径: $REMOTE_PATH"
echo "   分支: $BRANCH"
echo ""

# 测试连接
echo "🔍 测试 SSH 连接..."
if ssh -i "$PEM_FILE" -o ConnectTimeout=5 -o StrictHostKeyChecking=no $SSH_USER@$SERVER "echo '✅ SSH 连接成功'" 2>/dev/null; then
    echo "✅ SSH 连接正常"
else
    echo "❌ SSH 连接失败"
    echo ""
    echo "请检查："
    echo "  1. PEM 文件是否正确"
    echo "  2. 服务器地址是否正确"
    echo "  3. 用户名是否为 ubuntu"
    echo "  4. 网络连接是否正常"
    exit 1
fi

echo ""
read -p "确认开始同步？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消"
    exit 0
fi

echo ""
echo "📥 开始同步代码..."
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
        echo ""
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
    echo ""
    echo "1️⃣  重启服务："
    echo "   ssh -i \"$PEM_FILE\" $SSH_USER@$SERVER 'cd $REMOTE_PATH && pm2 restart whatsapp-crm'"
    echo ""
    echo "2️⃣  查看日志："
    echo "   ssh -i \"$PEM_FILE\" $SSH_USER@$SERVER 'pm2 logs whatsapp-crm --lines 50'"
    echo ""
    echo "3️⃣  查看状态："
    echo "   ssh -i \"$PEM_FILE\" $SSH_USER@$SERVER 'pm2 status'"
    echo ""
    echo "4️⃣  直接登录服务器："
    echo "   ssh -i \"$PEM_FILE\" $SSH_USER@$SERVER"
    echo ""
    
    # 询问是否重启服务
    read -p "是否需要重启服务？(y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "🔄 正在重启服务..."
        ssh -i "$PEM_FILE" $SSH_USER@$SERVER "cd $REMOTE_PATH && pm2 restart whatsapp-crm"
        
        if [ $? -eq 0 ]; then
            echo "✅ 服务重启成功"
            echo ""
            echo "📊 服务状态："
            ssh -i "$PEM_FILE" $SSH_USER@$SERVER "pm2 status | grep whatsapp-crm"
        else
            echo "❌ 服务重启失败，请手动检查"
        fi
    fi
else
    echo ""
    echo "❌ 部署失败！请检查错误信息"
    exit 1
fi
