# WhatsApp CRM 部署指南

## 📋 目录
- [手动部署](#手动部署)
- [自动部署（Webhook）](#自动部署webhook)
- [定时部署](#定时部署)
- [部署命令](#部署命令)

---

## 🚀 手动部署

### 方式 1: 使用部署脚本（推荐）

在服务器上运行：
```bash
cd /home/ubuntu/whatsapp-bot
./deploy.sh
```

或者使用快捷命令：
```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
alias deploy-crm="cd /home/ubuntu/whatsapp-bot && ./deploy.sh"

# 使用
deploy-crm
```

### 方式 2: 手动步骤

```bash
cd /home/ubuntu/whatsapp-bot
git pull origin main
npm install --production  # 如果 package.json 有更改
pm2 restart whatsapp-bot
```

---

## 🤖 自动部署（Webhook）

### 1. 启动 Webhook 服务器

```bash
# 方法 1: 使用 PM2 运行（推荐）
cd /home/ubuntu/whatsapp-bot
pm2 start webhook-server.js --name whatsapp-webhook

# 方法 2: 直接运行
node webhook-server.js
```

### 2. 在 GitHub 上配置 Webhook

1. 打开你的 GitHub 仓库: https://github.com/ai-caseylai/whatsapp-crm
2. 点击 **Settings** > **Webhooks** > **Add webhook**
3. 配置：
   - **Payload URL**: `http://whatsapp-crm.techforliving.app:9000/webhook/deploy`
   - **Content type**: `application/json`
   - **Secret**: 设置一个密钥（与服务器上的 GITHUB_WEBHOOK_SECRET 一致）
   - **Events**: 选择 `Just the push event`
   - **Active**: ✅ 勾选
4. 点击 **Add webhook**

### 3. 设置环境变量

```bash
# 编辑 PM2 环境变量
pm2 stop whatsapp-webhook
export GITHUB_WEBHOOK_SECRET="your-secure-secret-here"
pm2 start webhook-server.js --name whatsapp-webhook --update-env

# 或者创建 .env 文件
echo "GITHUB_WEBHOOK_SECRET=your-secure-secret-here" > .env
```

### 4. 测试 Webhook

推送代码到 GitHub 的 main 分支，Webhook 会自动触发部署。

查看 Webhook 日志：
```bash
pm2 logs whatsapp-webhook
```

---

## ⏰ 定时部署

使用 cron 定时检查并部署更新：

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每小时检查一次）
0 * * * * /home/ubuntu/whatsapp-bot/deploy.sh >> /home/ubuntu/whatsapp-bot/deploy.log 2>&1

# 或每天凌晨 3 点检查
0 3 * * * /home/ubuntu/whatsapp-bot/deploy.sh >> /home/ubuntu/whatsapp-bot/deploy.log 2>&1
```

查看部署日志：
```bash
tail -f /home/ubuntu/whatsapp-bot/deploy.log
```

---

## 📝 部署命令

### 部署脚本功能

`deploy.sh` 会自动执行以下操作：

1. ✅ 检查当前版本
2. ✅ 从 GitHub 拉取最新代码
3. ✅ 比较本地和远程版本
4. ✅ 如果有更新：
   - 保存本地更改（stash）
   - 拉取新代码
   - 检查是否需要安装依赖
   - 重启 PM2 服务
   - 显示更新日志
5. ✅ 验证服务状态

### 常用命令

```bash
# 查看服务状态
pm2 status

# 查看服务日志
pm2 logs whatsapp-bot

# 查看 Webhook 日志
pm2 logs whatsapp-webhook

# 重启服务
pm2 restart whatsapp-bot

# 查看 Git 状态
cd /home/ubuntu/whatsapp-bot && git status

# 查看最新提交
cd /home/ubuntu/whatsapp-bot && git log -5 --oneline

# 手动拉取代码（不重启）
cd /home/ubuntu/whatsapp-bot && git pull origin main
```

---

## 🔧 故障排除

### 问题 1: 部署脚本权限不足

```bash
chmod +x /home/ubuntu/whatsapp-bot/deploy.sh
```

### 问题 2: Git 冲突

```bash
cd /home/ubuntu/whatsapp-bot
git stash  # 保存本地更改
git pull origin main
```

### 问题 3: Webhook 无法访问

检查防火墙：
```bash
sudo ufw allow 9000
sudo ufw status
```

或使用 Nginx 反向代理（推荐）。

### 问题 4: 服务启动失败

```bash
# 查看详细错误
pm2 logs whatsapp-bot --err --lines 100

# 删除并重新启动
pm2 delete whatsapp-bot
pm2 start server.js --name whatsapp-bot
```

---

## 🌟 推荐配置

### 使用 Nginx 反向代理（更安全）

```nginx
# /etc/nginx/sites-available/whatsapp-crm
location /webhook/ {
    proxy_pass http://localhost:9000/webhook/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

然后 GitHub Webhook URL 改为：
```
https://whatsapp-crm.techforliving.app/webhook/deploy
```

### PM2 开机自启动

```bash
pm2 startup
pm2 save
```

---

## 📞 支持

如有问题，请：
1. 查看部署日志：`tail -f /home/ubuntu/whatsapp-bot/deploy.log`
2. 查看服务日志：`pm2 logs whatsapp-bot`
3. 检查 GitHub Webhook 状态
