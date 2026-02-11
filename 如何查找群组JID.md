# 查找群组 JID 的 SQL 查询

## 方法 1: 通过 Supabase Web 界面

1. 访问 Supabase Dashboard: https://supabase.com/dashboard
2. 选择项目
3. 进入 SQL Editor
4. 运行以下查询:

```sql
SELECT 
    jid, 
    name, 
    session_id,
    updated_at 
FROM whatsapp_contacts 
WHERE jid LIKE '%@g.us' 
ORDER BY updated_at DESC 
LIMIT 50;
```

5. 在结果中找到 "Casey 与 Casey 的对话群组"
6. 复制对应的 `jid` 列的值（例如: `120363XXXXXXXXXX@g.us`）

## 方法 2: 通过后端日志

当群组收到新消息时，后端日志会显示群组 JID:

```bash
# 查看实时日志
cd /Users/apple/CodeBuddy/whatsapp-crm
pm2 logs whatsapp-crm

# 或者如果直接运行
node server.js
```

在 "Casey 与 Casey 的对话群组" 中发送一条测试消息，日志会显示:
```
[session1] 📋 检测到 1 个群组的消息，正在获取群组信息...
[session1] Received 1 messages (type: notify)
[session1] 📤 广播实时新消息到前端: 120363XXXXXXXXXX@g.us
```

复制 JID: `120363XXXXXXXXXX@g.us`

## 方法 3: 通过前端界面

1. 打开 WhatsApp CRM 前端: http://localhost:3000 (或您的服务器地址)
2. 扫描 QR 码登录
3. 在联系人列表中找到 "Casey 与 Casey 的对话群组"
4. 点击该群组打开聊天
5. 打开浏览器开发者工具 (F12)
6. 在 Console 中输入: `window.location.href`
7. 查看 URL，找到 JID 参数

或者在 Network 标签中查看 API 请求，找到群组相关的请求。

## 配置步骤

找到 JID 后，编辑 `server.js`:

1. 找到第 26-30 行:
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    // 'XXXXXXXXXX@g.us',  // Casey 与 Casey 的对话群组
];
```

2. 替换为实际的 JID:
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363XXXXXXXXXX@g.us',  // Casey 与 Casey 的对话群组
];
```

3. 保存文件

4. 重启服务:
```bash
pm2 restart whatsapp-crm
# 或
node server.js
```

## 验证配置

1. 在 "Casey 与 Casey 的对话群组" 发送消息
   - 预期: 日志显示 `✅ 允许的群组消息，触发 webhook`
   - AI 机器人会回复

2. 在 "和Lamlam的群组" 发送消息
   - 预期: 日志显示 `⛔ 群组消息被过滤，不触发 webhook`
   - AI 机器人不会回复

## 常见问题

### Q: 如何添加多个允许的群组？
A: 在数组中添加多个 JID:
```javascript
const ALLOWED_WEBHOOK_GROUPS = [
    '120363111222333@g.us',  // Casey 与 Casey 的对话群组
    '120363444555666@g.us',  // 另一个允许的群组
];
```

### Q: 如何允许私聊也触发 webhook？
A: 找到 `server.js` 第 1025 行左右，取消注释:
```javascript
} else {
    sendWebhook('message', { sessionId, message: m });
}
```

### Q: 配置后还是在所有群组回复？
A: 
1. 检查 JID 是否正确（必须包含 `@g.us`）
2. 确认已重启服务
3. 查看日志确认过滤是否生效
