# SSH 连接问题解决方案

## ❌ 问题：Permission denied (publickey,password)

这个错误表示 SSH 无法连接到服务器。可能的原因和解决方案：

---

## 🔍 方案 1：检查 SSH 用户名

默认用户名可能不是 `apple`，常见的用户名有：

- `ubuntu` (Ubuntu 系统)
- `root` (某些 VPS)
- `admin` (某些云服务器)
- 您自己创建的用户名

### 测试不同用户名

```bash
# 测试 ubuntu 用户
ssh ubuntu@whatsapp-crm.techforliving.app

# 测试 root 用户
ssh root@whatsapp-crm.techforliving.app

# 测试 admin 用户
ssh admin@whatsapp-crm.techforliving.app
```

---

## 🔑 方案 2：配置 SSH 密钥

### 步骤 1：检查是否有 SSH 密钥

```bash
ls -la ~/.ssh/
```

如果看到 `id_rsa` 和 `id_rsa.pub`，说明已有密钥。

### 步骤 2：生成 SSH 密钥（如果没有）

```bash
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

一路按回车使用默认设置。

### 步骤 3：复制公钥到服务器

**方式 A：使用 ssh-copy-id（推荐）**

```bash
# 替换 USER 为实际用户名
ssh-copy-id USER@whatsapp-crm.techforliving.app

# 例如：
ssh-copy-id ubuntu@whatsapp-crm.techforliving.app
```

**方式 B：手动复制**

```bash
# 1. 查看公钥
cat ~/.ssh/id_rsa.pub

# 2. SSH 登录服务器（使用密码）
ssh USER@whatsapp-crm.techforliving.app

# 3. 在服务器上添加公钥
mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# 粘贴公钥，保存

chmod 600 ~/.ssh/authorized_keys
exit
```

### 步骤 4：测试连接

```bash
ssh USER@whatsapp-crm.techforliving.app
```

---

## 🔐 方案 3：使用密码登录

如果服务器允许密码登录：

```bash
# 使用 -o 选项强制密码认证
ssh -o PreferredAuthentications=password USER@whatsapp-crm.techforliving.app
```

---

## 📝 方案 4：配置 SSH config 文件

创建或编辑 `~/.ssh/config`：

```bash
nano ~/.ssh/config
```

添加以下内容：

```
Host whatsapp-crm
    HostName whatsapp-crm.techforliving.app
    User ubuntu
    Port 22
    IdentityFile ~/.ssh/id_rsa
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

保存后，可以直接使用：

```bash
ssh whatsapp-crm
```

---

## 🛠️ 方案 5：使用交互式同步脚本

我已创建了一个交互式脚本，可以手动输入用户名：

```bash
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
./sync-interactive.sh
```

脚本会询问：
- 服务器地址
- SSH 用户名
- 项目路径
- Git 分支

---

## 🔍 诊断命令

### 1. 详细的 SSH 连接测试

```bash
# 使用 -v 参数查看详细信息
ssh -v USER@whatsapp-crm.techforliving.app

# 使用 -vvv 查看更详细的信息
ssh -vvv USER@whatsapp-crm.techforliving.app
```

### 2. 检查本地 SSH 配置

```bash
# 查看 SSH 密钥
ls -la ~/.ssh/

# 查看 SSH 配置
cat ~/.ssh/config

# 查看已知主机
cat ~/.ssh/known_hosts | grep whatsapp-crm
```

### 3. 测试服务器端口

```bash
# 测试 SSH 端口是否开放
nc -zv whatsapp-crm.techforliving.app 22

# 或使用 telnet
telnet whatsapp-crm.techforliving.app 22
```

---

## 💡 推荐的解决步骤

### 第 1 步：找到正确的用户名

```bash
# 尝试常见用户名
ssh ubuntu@whatsapp-crm.techforliving.app
ssh root@whatsapp-crm.techforliving.app
ssh admin@whatsapp-crm.techforliving.app
```

### 第 2 步：配置 SSH 密钥

一旦找到正确的用户名，配置 SSH 密钥：

```bash
# 替换 USER 为实际用户名
ssh-copy-id USER@whatsapp-crm.techforliving.app
```

### 第 3 步：使用交互式脚本同步

```bash
cd /Users/apple/CodeBuddy/20260207234741/whatsapp-crm
./sync-interactive.sh
```

---

## 📞 如果还是无法连接

### 联系服务器管理员确认：

1. ✅ SSH 服务是否正在运行
2. ✅ 防火墙是否允许 SSH 连接
3. ✅ 您的 IP 是否被加入白名单
4. ✅ 正确的 SSH 用户名是什么
5. ✅ 是否需要特殊的 SSH 端口（非 22）
6. ✅ 是否需要跳板机（Bastion Host）

### 临时解决方案：手动操作

如果自动化脚本无法工作，您可以：

1. **手动 SSH 登录**
   ```bash
   ssh USER@whatsapp-crm.techforliving.app
   ```

2. **手动拉取代码**
   ```bash
   cd /path/to/whatsapp-crm
   git pull origin feature/gemini3
   ```

3. **手动重启服务**
   ```bash
   pm2 restart whatsapp-crm
   ```

---

## 🎯 快速测试清单

```bash
# 1. 测试网络连接
ping whatsapp-crm.techforliving.app

# 2. 测试 SSH 端口
nc -zv whatsapp-crm.techforliving.app 22

# 3. 测试 SSH 连接（使用详细模式）
ssh -v ubuntu@whatsapp-crm.techforliving.app

# 4. 检查本地 SSH 密钥
ls -la ~/.ssh/id_rsa*

# 5. 查看 SSH 密钥指纹
ssh-keygen -lf ~/.ssh/id_rsa.pub
```

---

需要更多帮助，请提供 `ssh -vvv` 的输出信息。
