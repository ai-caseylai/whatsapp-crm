# 群组过滤配置说明

## 问题
WhatsApp 机器人在所有群组中都回复消息，包括不应该回复的群组（如"和Lamlam的群组"）。

## 解决方案
添加了群组过滤功能，只有在允许列表中的群组才会触发 webhook（AI 机器人回复）。

## 如何配置

### 步骤 1: 获取群组 JID

1. 打开 WhatsApp CRM 前端界面 (http://localhost:3000 或您的服务器地址)
2. 在联系人列表中找到 **"Casey 与 Casey 的对话群组"**
3. 点击该群组打开聊天
4. 查看浏览器地址栏，找到群组的 JID
   - 格式类似: `120363XXXXXXXXXX@g.us`
5. 复制完整的 JID

**或者通过后端日志获取：**
```bash
# 查看后端日志，当群组收到消息时会显示 JID
pm2 logs whatsapp-crm

# 或者查询数据库
# 在 Supabase 中执行:
SELECT jid, name FROM whatsapp_contacts WHERE jid LIKE '%@g.us' ORDER BY updated_at DESC LIMIT 20;
```

### 步骤 2: 配置允许的群组

编辑 `server.js` 文件，找到第 26-30 行左右的配置：

```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    // 'XXXXXXXXXX@g.us',  // Casey 与 Casey 的对话群组 (请替换为实际的群组 JID)
];
```

将其修改为：

```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363XXXXXXXXXX@g.us',  // Casey 与 Casey 的对话群组 (替换为实际的 JID)
];
```

**示例（假设群组 JID 是 `120363123456789@g.us`）：**
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363123456789@g.us',  // Casey 与 Casey 的对话群组
];
```

### 步骤 3: 重启服务

```bash
# 如果使用 PM2
pm2 restart whatsapp-crm

# 如果直接运行
# 先停止当前进程 (Ctrl+C)
# 然后重新启动
node server.js
```

## 工作原理

### 修改位置
- **`server.js` 第 20-50 行**: 添加了群组过滤配置和检查函数
- **`server.js` 第 1008-1035 行**: 在发送 webhook 前添加群组过滤逻辑

### 过滤规则

1. **群组消息**:
   - ✅ 如果群组 JID 在 `ALLOWED_WEBHOOK_GROUPS` 列表中 → 触发 webhook（AI 机器人回复）
   - ⛔ 如果群组 JID 不在列表中 → 不触发 webhook（机器人不回复）
   - 📝 所有消息仍然保存到数据库，并在前端显示

2. **私聊消息**:
   - 默认不触发 webhook
   - 如需允许私聊触发 webhook，取消注释 `server.js` 第 1025 行

### 日志说明

修改后，日志会清楚显示过滤情况：

```
[session1] ✅ 允许的群组消息，触发 webhook: 120363123456789@g.us
[session1] ⛔ 群组消息被过滤，不触发 webhook: 120363987654321@g.us
[session1] 📝 私聊消息，不触发 webhook: 85212345678@s.whatsapp.net
```

## 测试

### 测试 1: 在允许的群组发送消息
1. 在 "Casey 与 Casey 的对话群组" 发送一条消息
2. **预期结果**: 
   - 后端日志显示: `✅ 允许的群组消息，触发 webhook`
   - AI 机器人回复消息

### 测试 2: 在其他群组发送消息
1. 在 "和Lamlam的群组" 发送一条消息
2. **预期结果**:
   - 后端日志显示: `⛔ 群组消息被过滤，不触发 webhook`
   - AI 机器人**不回复**
   - 消息仍然保存到数据库，前端可以看到

## 故障排查

### 问题 1: 机器人还是在所有群组回复
- **检查**: `ALLOWED_WEBHOOK_GROUPS` 是否为空数组 `[]`
- **原因**: 空数组会触发向后兼容模式，允许所有群组
- **解决**: 添加至少一个群组 JID

### 问题 2: 机器人在允许的群组也不回复了
- **检查**: 群组 JID 是否正确（包括 `@g.us` 后缀）
- **检查**: 后端日志是否显示 `✅ 允许的群组消息`
- **检查**: webhook URL 是否正确配置

### 问题 3: 如何添加多个允许的群组
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363123456789@g.us',  // Casey 与 Casey 的对话群组
    '120363987654321@g.us',  // 另一个允许的群组
    '120363111222333@g.us',  // 第三个允许的群组
];
```

## 快速参考

### 获取所有群组 JID（Supabase SQL）
```sql
SELECT 
    jid, 
    name, 
    updated_at 
FROM whatsapp_contacts 
WHERE jid LIKE '%@g.us' 
    AND session_id = 'YOUR_SESSION_ID'
ORDER BY updated_at DESC;
```

### 允许私聊也触发 webhook
找到 `server.js` 第 1025 行左右，取消注释：
```javascript
} else {
    // 私聊消息触发 webhook
    sendWebhook('message', { sessionId, message: m });
}
```

---

**修改完成时间**: 2026-02-11
**修改人**: AI Assistant
