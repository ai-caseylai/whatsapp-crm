# GitHub Webhook 配置说明

## ✅ 服务器配置已完成

### 已完成的配置：
- ✅ Webhook 服务器已启动（PM2）
- ✅ 密钥已配置：`5255888ad9d96bab0296a5a2eb882d5ea62656f44101d9794ff083c54e75953a`
- ✅ 防火墙已配置
- ✅ Nginx 反向代理已配置
- ✅ Webhook 端点已测试：http://whatsapp-crm.techforliving.app/webhook/deploy

---

## 📝 GitHub Webhook 配置步骤

### 步骤 1: 访问仓库设置

1. 打开浏览器，访问：
   ```
   https://github.com/ai-caseylai/whatsapp-crm/settings/hooks
   ```

2. 或者手动导航：
   - 访问 https://github.com/ai-caseylai/whatsapp-crm
   - 点击 **Settings**（设置）
   - 点击左侧菜单的 **Webhooks**
   - 点击 **Add webhook**（添加 webhook）

### 步骤 2: 配置 Webhook

在 Webhook 配置页面填写以下信息：

#### **Payload URL**（必填）
```
http://whatsapp-crm.techforliving.app/webhook/deploy
```

#### **Content type**（必填）
选择：`application/json`

#### **Secret**（推荐）
```
5255888ad9d96bab0296a5a2eb882d5ea62656f44101d9794ff083c54e75953a
```

#### **Which events would you like to trigger this webhook?**
选择：`Just the push event`（只选择推送事件）

#### **Active**
✅ 勾选（确保 Webhook 处于激活状态）

### 步骤 3: 保存配置

点击页面底部的 **Add webhook**（添加 webhook）按钮。

---

## 🧪 测试 Webhook

### 方法 1: 通过 GitHub 测试

1. Webhook 添加后，GitHub 会自动发送一个 ping 事件
2. 在 Webhook 配置页面，点击你刚创建的 Webhook
3. 滚动到底部的 **Recent Deliveries**（最近的推送）
4. 查看是否有成功的响应（绿色勾号）

### 方法 2: 推送代码测试

1. 在本地修改任意文件：
   ```bash
   cd /Users/apple/Desktop/development/whatsapp-crm
   echo "# Test webhook" >> README.md
   git add README.md
   git commit -m "test: 测试 Webhook 自动部署"
   git push origin main
   ```

2. 查看服务器日志：
   ```bash
   ssh whatsapp-crm
   pm2 logs whatsapp-webhook
   ```

3. 应该看到类似这样的输出：
   ```
   📨 收到 GitHub Webhook 请求
   📌 事件: push, 分支: refs/heads/main
   🚀 触发自动部署...
   ✅ 部署成功
   ```

---

## 🔍 验证自动部署

### 查看 Webhook 日志
```bash
ssh whatsapp-crm
pm2 logs whatsapp-webhook --lines 50
```

### 查看部署日志
```bash
ssh whatsapp-crm
tail -f /home/ubuntu/whatsapp-bot/deploy.log  # 如果配置了日志文件
```

### 查看应用状态
```bash
ssh whatsapp-crm
pm2 status
```

---

## ❌ 故障排除

### 问题 1: Webhook 收到请求但部署失败

检查日志：
```bash
ssh whatsapp-crm
pm2 logs whatsapp-webhook --err --lines 100
```

### 问题 2: GitHub 显示 Webhook 发送失败

1. 检查服务器是否在线：
   ```bash
   curl http://whatsapp-crm.techforliving.app/webhook/deploy
   ```

2. 检查 Webhook 服务是否运行：
   ```bash
   ssh whatsapp-crm "pm2 status whatsapp-webhook"
   ```

### 问题 3: 签名验证失败

确认 GitHub Secret 和服务器 .env 文件中的密钥一致：
```bash
ssh whatsapp-crm "cat /home/ubuntu/whatsapp-bot/.env"
```

应该显示：
```
GITHUB_WEBHOOK_SECRET=5255888ad9d96bab0296a5a2eb882d5ea62656f44101d9794ff083c54e75953a
```

---

## 🔐 安全建议

1. ✅ 已使用 Secret 验证请求签名
2. ✅ Webhook 服务通过 Nginx 反向代理
3. ⚠️  建议启用 HTTPS（Let's Encrypt）

### 启用 HTTPS（可选）

```bash
ssh whatsapp-crm
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d whatsapp-crm.techforliving.app
```

启用 HTTPS 后，Webhook URL 改为：
```
https://whatsapp-crm.techforliving.app/webhook/deploy
```

---

## 📊 监控和维护

### 查看 Webhook 统计
在 GitHub Webhook 页面可以看到：
- 发送成功率
- 响应时间
- 错误日志

### 重启 Webhook 服务
```bash
ssh whatsapp-crm
pm2 restart whatsapp-webhook
```

### 查看实时日志
```bash
ssh whatsapp-crm
pm2 logs whatsapp-webhook --lines 0
```

---

## ✅ 完成后的工作流程

配置完成后，你的工作流程将是：

```
1. 本地修改代码
2. git commit & git push
3. 🎉 自动部署！（无需任何操作）
4. 查看日志验证部署成功
```

---

## 📞 快速帮助

### 服务器信息
- Webhook URL: http://whatsapp-crm.techforliving.app/webhook/deploy
- Webhook 端口: 9000（内部）
- Nginx 代理: 80/443（外部）

### 重要文件位置
- Webhook 服务器: `/home/ubuntu/whatsapp-bot/webhook-server.js`
- 环境变量: `/home/ubuntu/whatsapp-bot/.env`
- 部署脚本: `/home/ubuntu/whatsapp-bot/deploy.sh`
- Nginx 配置: `/etc/nginx/sites-available/webhook`

### 常用命令
```bash
# 查看 Webhook 状态
ssh whatsapp-crm "pm2 status whatsapp-webhook"

# 查看 Webhook 日志
ssh whatsapp-crm "pm2 logs whatsapp-webhook"

# 重启 Webhook
ssh whatsapp-crm "pm2 restart whatsapp-webhook"

# 测试 Webhook
curl -X POST http://whatsapp-crm.techforliving.app/webhook/deploy
```

---

**密钥（请妥善保管）：**
```
5255888ad9d96bab0296a5a2eb882d5ea62656f44101d9794ff083c54e75953a
```

**配置完成后，请务必测试一次推送！** 🎊
