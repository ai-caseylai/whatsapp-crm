# WhatsApp 机器人群组过滤修复总结

## 问题描述
WhatsApp AI 机器人在所有群组中都回复消息，包括不应该回复的群组：
- ✅ **应该回复**: "Casey 与 Casey 的对话群组"
- ❌ **不应该回复**: "和Lamlam的群组" 以及其他群组

## 修复内容

### 1. 添加群组过滤配置 (`server.js` 第 20-50 行)
```javascript
// 群组白名单配置
const ALLOWED_WEBHOOK_GROUPS = [
    // '120363XXXXXXXXXX@g.us',  // Casey 与 Casey 的对话群组
];

// 检查函数
function isAllowedWebhookGroup(remoteJid) {
    if (!remoteJid || !remoteJid.endsWith('@g.us')) {
        return false;
    }
    if (ALLOWED_WEBHOOK_GROUPS.length === 0) {
        console.log(`⚠️  警告: ALLOWED_WEBHOOK_GROUPS 为空`);
        return true;
    }
    return ALLOWED_WEBHOOK_GROUPS.includes(remoteJid);
}
```

### 2. 修改消息处理逻辑 (`server.js` 第 1008-1035 行)
- 在发送 webhook 前检查群组是否在白名单中
- 添加详细的日志记录
- 允许的群组: `✅ 允许的群组消息，触发 webhook`
- 过滤的群组: `⛔ 群组消息被过滤，不触发 webhook`

### 3. 创建配置文档
- `GROUP_FILTER_CONFIG.md`: 详细配置说明
- `如何查找群组JID.md`: 查找群组 JID 的方法

## 下一步操作

### 步骤 1: 查找群组 JID

**推荐方法 - 使用 Supabase**:
1. 访问 https://supabase.com/dashboard
2. 选择您的项目
3. 进入 SQL Editor
4. 运行查询:
```sql
SELECT jid, name, updated_at 
FROM whatsapp_contacts 
WHERE jid LIKE '%@g.us' 
ORDER BY updated_at DESC 
LIMIT 50;
```
5. 找到 "Casey 与 Casey 的对话群组" 的 JID

**替代方法 - 查看日志**:
```bash
cd /Users/apple/CodeBuddy/whatsapp-crm
pm2 logs whatsapp-crm
```
在目标群组发送一条测试消息，日志会显示群组 JID。

### 步骤 2: 配置白名单

编辑 `server.js` 第 26-30 行:
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363XXXXXXXXXX@g.us',  // 替换为实际的群组 JID
];
```

### 步骤 3: 部署到服务器

```bash
cd /Users/apple/CodeBuddy/whatsapp-crm

# 提交更改
git add .
git commit -m "配置群组白名单"

# 推送到 GitHub
git push origin main

# SSH 到服务器
ssh ubuntu@whatsapp-crm.techforliving.app -i ~/.ssh/claw2.pem

# 在服务器上拉取最新代码
cd /home/ubuntu/whatsapp-bot
git pull origin main

# 重启服务
pm2 restart whatsapp-crm

# 查看日志确认
pm2 logs whatsapp-crm
```

### 步骤 4: 测试验证

**测试 1 - 允许的群组**:
1. 在 "Casey 与 Casey 的对话群组" 发送消息
2. 预期: AI 机器人回复
3. 日志显示: `✅ 允许的群组消息，触发 webhook`

**测试 2 - 其他群组**:
1. 在 "和Lamlam的群组" 发送消息
2. 预期: AI 机器人不回复
3. 日志显示: `⛔ 群组消息被过滤，不触发 webhook`

## 技术细节

### 过滤机制
- **位置**: `server.js` 消息处理事件监听器
- **时机**: 在发送 webhook 之前
- **范围**: 仅影响 webhook 触发（AI 机器人回复）
- **不影响**: 
  - 消息仍然保存到数据库
  - 前端仍然显示所有消息
  - WebSocket 广播正常工作

### 日志标识
- `✅ 允许的群组消息，触发 webhook` - 白名单群组
- `⛔ 群组消息被过滤，不触发 webhook` - 非白名单群组
- `📝 私聊消息，不触发 webhook` - 私聊消息

## 文件变更

### 修改的文件
- `server.js`: 添加过滤逻辑

### 新增的文件
- `GROUP_FILTER_CONFIG.md`: 配置说明文档
- `如何查找群组JID.md`: JID 查找指南
- `find-group-jid.sh`: 群组查找脚本（需要在项目目录运行）
- `FIXING_SUMMARY.md`: 本文件

## Git 提交记录
```
commit 052cdf3
修复：添加群组过滤功能，防止机器人在未授权群组回复
- 添加 ALLOWED_WEBHOOK_GROUPS 配置
- 在发送 webhook 前检查群组 JID
- 添加详细日志记录
- 创建配置文档
```

## 故障排查

### 问题: 所有群组都还在回复
**原因**: `ALLOWED_WEBHOOK_GROUPS` 为空数组
**解决**: 添加至少一个群组 JID

### 问题: 允许的群组也不回复了
**检查**:
1. 群组 JID 是否正确（包括 `@g.us`）
2. 是否重启了服务
3. 日志是否显示 `✅ 允许的群组消息`

### 问题: 如何恢复原来的行为（所有群组都回复）
**方法 1**: 将 `ALLOWED_WEBHOOK_GROUPS` 设为空数组 `[]`
**方法 2**: 添加所有群组 JID 到白名单

---

**修复完成时间**: 2026-02-11
**修复人**: AI Assistant
**状态**: ✅ 已完成代码修改，等待配置和部署
