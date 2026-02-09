# 服务器部署指南

## 🚀 快速部署

### 方式 1：一键快速同步（推荐）

```bash
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
./quick-sync.sh
```

这会：
1. ✅ SSH 连接到服务器
2. ✅ 拉取最新代码
3. ✅ 显示同步结果

---

### 方式 2：完整部署流程

```bash
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
./deploy-to-server.sh
```

这会：
1. ✅ 测试 SSH 连接
2. ✅ 检查远程目录
3. ✅ 拉取最新代码
4. ✅ 可选：安装依赖
5. ✅ 可选：重启服务
6. ✅ 可选：检查状态

---

### 方式 3：手动操作

#### 3.1 SSH 连接到服务器

```bash
ssh whatsapp-crm.techforliving.app
```

#### 3.2 进入项目目录

```bash
cd /home/ubuntu/whatsapp-crm
# 或者
cd /var/www/whatsapp-crm
# 或者其他实际路径
```

#### 3.3 拉取最新代码

```bash
# 检查当前分支
git branch

# 拉取最新代码
git fetch origin
git pull origin feature/gemini3

# 或者切换到其他分支
git checkout main
git pull origin main
```

#### 3.4 安装依赖（如果有新的依赖）

```bash
npm install
```

#### 3.5 重启服务

**如果使用 PM2：**
```bash
pm2 restart whatsapp-crm
pm2 status
pm2 logs whatsapp-crm
```

**如果使用 systemd：**
```bash
sudo systemctl restart whatsapp-crm
sudo systemctl status whatsapp-crm
sudo journalctl -u whatsapp-crm -f
```

**如果直接运行：**
```bash
# 停止旧进程
pkill -f "node server.js"

# 启动新进程
nohup node server.js > output.log 2>&1 &
```

---

## 📋 服务器信息

### 需要确认的信息

在使用脚本之前，请确认以下信息：

1. **服务器地址**
   - 当前设置：`whatsapp-crm.techforliving.app`
   - 确认是否正确

2. **项目路径**
   - 可能的路径：
     - `/home/ubuntu/whatsapp-crm`
     - `/var/www/whatsapp-crm`
     - `/opt/whatsapp-crm`
   - 需要修改脚本中的 `REMOTE_PATH`

3. **Git 分支**
   - 当前设置：`feature/gemini3`
   - 确认是否需要切换到 `main` 分支

4. **进程管理方式**
   - PM2
   - systemd
   - supervisor
   - 直接运行

---

## 🔧 首次配置

### 1. 配置 SSH 密钥（如果还没配置）

```bash
# 生成 SSH 密钥（如果没有）
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"

# 复制公钥到服务器
ssh-copy-id whatsapp-crm.techforliving.app

# 测试连接
ssh whatsapp-crm.techforliving.app "echo 'SSH 连接成功'"
```

### 2. 修改部署脚本配置

编辑 `deploy-to-server.sh` 和 `quick-sync.sh`：

```bash
# 修改服务器地址
SERVER="your-server.com"

# 修改远程路径
REMOTE_PATH="/path/to/your/project"

# 修改分支名
BRANCH="main"  # 或 feature/gemini3
```

### 3. 在服务器上初始化 Git 仓库（如果是第一次）

```bash
ssh whatsapp-crm.techforliving.app

# 克隆仓库
cd /home/ubuntu
git clone https://github.com/ai-caseylai/whatsapp-crm.git
cd whatsapp-crm

# 切换到指定分支
git checkout feature/gemini3

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
nano .env
# 填入正确的配置

# 启动服务（使用 PM2）
pm2 start server.js --name whatsapp-crm
pm2 save
pm2 startup
```

---

## 🔍 故障排除

### 问题 1：SSH 连接失败

```bash
# 检查 SSH 连接
ssh -v whatsapp-crm.techforliving.app

# 可能的原因：
# 1. 服务器地址错误
# 2. SSH 密钥未配置
# 3. 防火墙阻止
# 4. 需要使用密码登录

# 使用密码登录
ssh user@whatsapp-crm.techforliving.app
```

### 问题 2：Git 拉取失败

```bash
ssh whatsapp-crm.techforliving.app

cd /path/to/whatsapp-crm

# 检查 Git 状态
git status

# 如果有未提交的更改
git stash
git pull origin feature/gemini3
git stash pop

# 如果有冲突
git reset --hard origin/feature/gemini3
```

### 问题 3：服务无法启动

```bash
# 检查日志
pm2 logs whatsapp-crm

# 检查端口占用
sudo lsof -i :3000

# 检查进程
ps aux | grep node

# 手动启动测试
cd /path/to/whatsapp-crm
node server.js
```

### 问题 4：权限问题

```bash
# 修改文件所有者
sudo chown -R $USER:$USER /path/to/whatsapp-crm

# 修改执行权限
chmod +x *.sh
```

---

## 📊 监控和日志

### 查看服务状态

```bash
# PM2 状态
ssh whatsapp-crm.techforliving.app "pm2 status"

# 查看日志
ssh whatsapp-crm.techforliving.app "pm2 logs whatsapp-crm --lines 50"

# 实时日志
ssh whatsapp-crm.techforliving.app "pm2 logs whatsapp-crm -f"
```

### 查看系统资源

```bash
# CPU 和内存使用
ssh whatsapp-crm.techforliving.app "pm2 monit"

# 系统资源
ssh whatsapp-crm.techforliving.app "htop"
```

---

## 🔄 完整部署流程示例

```bash
# 1. 本地提交代码
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
git add .
git commit -m "更新功能"
git push origin feature/gemini3

# 2. 快速同步到服务器
./quick-sync.sh

# 3. 重启服务（如果需要）
ssh whatsapp-crm.techforliving.app "pm2 restart whatsapp-crm"

# 4. 查看日志确认
ssh whatsapp-crm.techforliving.app "pm2 logs whatsapp-crm --lines 20"

# 5. 测试功能
curl https://whatsapp-crm.techforliving.app/health
# 或者在浏览器访问
open https://whatsapp-crm.techforliving.app
```

---

## 💡 最佳实践

1. **部署前测试**
   - 在本地完整测试所有功能
   - 确保没有语法错误

2. **增量部署**
   - 先部署到测试环境
   - 确认无误后再部署到生产环境

3. **备份**
   - 部署前备份数据库
   - 保存当前版本的代码快照

4. **回滚准备**
   - 记录当前的 commit hash
   - 如果出问题可以快速回滚

5. **监控**
   - 部署后持续观察日志
   - 检查错误率和性能

---

## 🎯 快速参考命令

```bash
# 连接服务器
ssh whatsapp-crm.techforliving.app

# 更新代码
cd /path/to/whatsapp-crm && git pull origin feature/gemini3

# 重启服务
pm2 restart whatsapp-crm

# 查看日志
pm2 logs whatsapp-crm

# 查看状态
pm2 status

# 查看进程
pm2 monit
```

---

需要帮助？请检查日志或联系管理员。
