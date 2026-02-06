# WebSocket 实时消息推送功能说明

## ✅ 已完成部署

部署时间: 2026年2月6日 12:04
状态: 🟢 运行中

---

## 🎯 功能说明

### 问题
之前使用轮询机制（每5秒请求一次），导致：
- 延迟较大（最多5秒才能看到新消息）
- 服务器负载较高（频繁的HTTP请求）
- 不够实时

### 解决方案
使用 **WebSocket** 实现真正的实时消息推送：
- ⚡ **即时推送** - 收到新消息立即显示（毫秒级延迟）
- 🚀 **更高效** - 减少不必要的HTTP请求
- 💾 **更省资源** - 服务器和客户端负载更低

---

## 🔧 技术实现

### 后端 (server.js)

1. **安装 WebSocket 库**
   ```bash
   npm install ws
   ```

2. **创建 WebSocket 服务器**
   ```javascript
   const WebSocket = require('ws');
   const server = http.createServer(app);
   const wss = new WebSocket.Server({ server });
   ```

3. **广播新消息**
   ```javascript
   function broadcastMessage(sessionId, chatId, message) {
       const data = JSON.stringify({
           type: 'new_message',
           sessionId,
           chatId,
           message
       });
       
       wss.clients.forEach((client) => {
           if (client.readyState === WebSocket.OPEN) {
               client.send(data);
           }
       });
   }
   ```

4. **消息接收时触发广播**
   - 当收到新的 WhatsApp 消息（`messages.upsert` 事件）
   - 保存到数据库后
   - 立即通过 WebSocket 广播给所有连接的客户端

### 前端 (index.html)

1. **建立 WebSocket 连接**
   ```javascript
   const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
   const wsUrl = `${protocol}//${window.location.host}`;
   ws = new WebSocket(wsUrl);
   ```

2. **接收实时消息**
   ```javascript
   ws.onmessage = (event) => {
       const data = JSON.parse(event.data);
       if (data.type === 'new_message') {
           // 如果是当前打开的聊天，立即刷新
           if (currentChatId === data.chatId) {
               refreshMessages(data.chatId);
           }
           // 刷新联系人列表
           loadContacts();
       }
   };
   ```

3. **自动重连机制**
   - WebSocket 断开后，5秒后自动重连
   - 确保连接稳定性

---

## 🚀 使用方法

### 用户操作

1. **打开网页**
   - 访问 https://whatsapp-crm.techforliving.app
   - 页面会自动连接 WebSocket 服务器

2. **查看连接状态**
   - 打开浏览器开发者工具（F12）
   - 切换到 Console 标签
   - 看到 "✅ WebSocket 已連接" 表示连接成功

3. **测试实时消息**
   - 打开任意聊天窗口
   - 从手机向该联系人发送消息
   - 消息应该**立即出现**在网页上（无需等待）

---

## 📊 性能对比

| 特性 | 轮询机制（旧） | WebSocket（新） |
|------|---------------|----------------|
| 延迟 | 0-5 秒 | 毫秒级 |
| HTTP 请求数 | 720/小时 | 1次（建立连接） |
| 服务器负载 | 高 | 低 |
| 实时性 | ❌ 不够实时 | ✅ 真正实时 |
| 资源消耗 | 高 | 低 |

---

## 🔍 验证部署

### 1. 检查 WebSocket 连接

在浏览器控制台（F12 → Console）应该看到：
```
🔌 連接 WebSocket: wss://whatsapp-crm.techforliving.app
✅ WebSocket 已連接
```

### 2. 检查网络请求

在浏览器开发者工具（F12 → Network）：
- 筛选 "WS"（WebSocket）
- 应该看到一个持续连接到服务器的 WebSocket

### 3. 测试消息推送

1. 打开一个聊天窗口
2. 从手机发送测试消息
3. 在 Console 中应该看到：
   ```
   📨 收到 WebSocket 消息: {type: 'new_message', ...}
   🔄 刷新當前聊天: 120363...@g.us
   ```
4. 消息立即显示在网页上

---

## 🎛️ 系统状态

### 服务运行状态

```
✅ whatsapp-bot      - 在线 (194 MB)
✅ whatsapp-webhook  - 在线 (67 MB)  
✅ whatsapp-admin    - 在线 (68 MB)
```

### 服务器日志

查看实时日志：
```bash
ssh -i claw2.pem ubuntu@whatsapp-crm.techforliving.app
pm2 logs whatsapp-bot --lines 50
```

应该看到：
- "🔌 新的 WebSocket 連接" - 当用户打开网页时
- "🔌 WebSocket 服務器已啟動" - 服务启动时

---

## 🐛 故障排除

### 问题1: WebSocket 连接失败

**症状**: 控制台显示 "❌ WebSocket 錯誤"

**解决方案**:
1. 检查服务器是否运行：`pm2 status`
2. 检查防火墙设置是否允许 WebSocket
3. 刷新浏览器页面（Cmd+R）

### 问题2: 消息还是不实时

**症状**: 消息延迟显示

**解决方案**:
1. 检查 WebSocket 是否连接：F12 → Console
2. 检查是否显示 "✅ WebSocket 已連接"
3. 如果没有，等待5秒自动重连
4. 如果还是不行，刷新页面

### 问题3: 连接频繁断开

**症状**: 反复看到 "❌ WebSocket 已斷開，5秒後重連..."

**解决方案**:
1. 检查网络连接
2. 检查服务器负载：`pm2 monit`
3. 查看服务器日志：`pm2 logs whatsapp-bot`
4. 可能需要重启服务：`pm2 restart whatsapp-bot`

---

## 🔧 配置选项

### 重连间隔

在 `index.html` 中修改重连间隔：
```javascript
ws.onclose = () => {
    console.log('❌ WebSocket 已斷開，5秒後重連...');
    setTimeout(connectWebSocket, 5000); // 修改这里的数字（毫秒）
};
```

### 超时设置

WebSocket 默认没有超时，如果需要添加心跳检测：
```javascript
let heartbeatInterval;

ws.onopen = () => {
    console.log('✅ WebSocket 已連接');
    
    // 心跳检测（每30秒发送一次ping）
    heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
};

ws.onclose = () => {
    clearInterval(heartbeatInterval);
    // ... 重连逻辑
};
```

---

## 📈 未来优化

### 1. 消息队列
- 实现消息队列，避免消息丢失
- 离线消息缓存

### 2. 房间机制
- 用户只订阅自己的会话
- 减少不必要的消息推送

### 3. 压缩传输
- 使用消息压缩减少带宽
- 批量发送多条消息

### 4. 更多事件类型
- 联系人上线/下线状态
- 正在输入提示
- 消息已读回执

---

## 🎯 测试清单

在部署后，请验证以下功能：

- [x] WebSocket 连接成功
- [x] 服务器正常运行
- [x] 新消息实时显示
- [x] 自动重连机制工作
- [x] 联系人列表自动更新
- [x] 多个标签页同时工作
- [x] 断网后重连成功

---

## 📞 支持

如果遇到问题：
1. 查看浏览器控制台日志（F12 → Console）
2. 查看服务器日志：`pm2 logs whatsapp-bot`
3. 检查服务状态：`pm2 status`
4. 重启服务：`pm2 restart whatsapp-bot`

---

**部署完成！** 🎉

现在您可以享受真正的实时消息推送体验！

**最后更新**: 2026年2月6日
**版本**: v2.0 - WebSocket实时推送
