# WhatsApp CRM 更新日志

## [2026-02-05] 修复消息接收和历史同步问题

### 🎯 解决的问题

1. ✅ **修复无法接收新消息的问题**
2. ✅ **修复没有下载所有旧消息的问题**
3. ✅ **修复没有下载所有图片、视频、emoji、回应的问题**

---

### 📝 详细改进

#### 1. 消息接收改进

**问题**：系统无法接收新消息

**解决方案**：
- 添加 `emitOwnEvents: true` - 确保接收自己发送的消息
- 添加 `shouldSyncHistoryMessage: () => true` - 确保同步所有历史消息
- 改进 `getMessage` 函数 - 从数据库获取消息以支持消息重试
- 添加 `messages.update` 事件监听器 - 捕获消息更新（编辑、删除等）
- 添加 `messages.reaction` 事件监听器 - 捕获反应事件

```javascript
// 新增配置
emitOwnEvents: true,
shouldSyncHistoryMessage: () => true,
getMessage: async (key) => {
    const { data } = await supabase
        .from('whatsapp_messages')
        .select('full_message_json')
        .eq('session_id', sessionId)
        .eq('message_id', key.id)
        .single();
    
    if (data?.full_message_json?.message) {
        return data.full_message_json.message;
    }
    return { conversation: 'Message not found' };
}
```

#### 2. 历史消息同步改进

**问题**：没有下载所有旧消息

**解决方案**：
- 改进 `messaging-history.set` 事件处理
- 添加聊天信息（chats）的保存
- 减小批处理大小（从 50 降到 25）提高稳定性
- 添加详细的进度日志
- 添加同步完成提示
- 将 `ignoreDuplicates` 改为 `false` 以更新现有消息

```javascript
// 新增聊天信息保存
if (chats.length > 0) {
    const chatContacts = chats.map(chat => ({
        session_id: sessionId,
        jid: chat.id,
        name: chat.name || chat.id.split('@')[0],
        notify: chat.name,
        is_group: chat.id.endsWith('@g.us'),
        unread_count: chat.unreadCount || 0,
        updated_at: new Date(chat.conversationTimestamp * 1000 || Date.now())
    }));
    
    await supabase.from('whatsapp_contacts')
        .upsert(chatContacts, { onConflict: 'session_id,jid' });
}

// 进度日志
console.log(`[${sessionId}] Processing ${messages.length} history messages...`);
console.log(`[${sessionId}] Saved ${processedCount}/${messages.length} history messages...`);
console.log(`[${sessionId}] ✅ History sync completed! Processed ${processedCount} messages.`);
```

#### 3. 媒体下载改进

**问题**：没有下载所有图片、视频、emoji、回应

**解决方案**：
- 扩展支持的媒体类型（添加 `pttMessage` 语音消息）
- 改进文件扩展名识别逻辑
- 添加详细的下载日志
- 改进错误处理
- 添加文件大小日志

```javascript
const mediaTypes = {
    'imageMessage': 'image',
    'videoMessage': 'video',
    'documentMessage': 'document',
    'audioMessage': 'audio',
    'stickerMessage': 'sticker',
    'pttMessage': 'audio' // Voice messages
};

// 改进的扩展名处理
if (messageType === 'documentMessage') {
    const fileName = realMessage.documentMessage?.fileName;
    if (fileName && fileName.includes('.')) {
        ext = fileName.split('.').pop();
    }
} else if (messageType === 'audioMessage' || messageType === 'pttMessage') {
    ext = 'ogg';
} else if (messageType === 'stickerMessage') {
    ext = 'webp';
} else if (messageType === 'imageMessage' && !ext) {
    ext = 'jpg';
} else if (messageType === 'videoMessage' && !ext) {
    ext = 'mp4';
}

console.log(`[${sessionId}] Saved media to ${attachmentFilename} (${buffer.length} bytes)`);
```

#### 4. Emoji 回应和引用回复

**问题**：Emoji 回应被跳过，引用回复没有标识

**解决方案**：
- 保存 reaction 消息而不是返回 null
- 添加引用回复的检测和标识
- 显示回应的 emoji 内容

```javascript
// Reactions
if (realMessage?.reactionMessage) {
    const reaction = realMessage.reactionMessage;
    contentText = `${reaction.text || '❤️'} (回應訊息)`;
}

// Quoted messages
if (realMessage?.extendedTextMessage?.contextInfo?.quotedMessage) {
    quotedMessage = realMessage.extendedTextMessage.contextInfo;
}

if (quotedMessage) {
    contentText = `[回覆] ${contentText}`;
}
```

#### 5. 新增事件监听器

添加了多个事件监听器以确保捕获所有更新：

- `messages.update` - 消息更新（编辑、删除）
- `messages.reaction` - 消息反应
- `contacts.update` - 联系人信息更新
- `groups.update` - 群组信息更新

```javascript
sock.ev.on('contacts.update', async (updates) => {
    console.log(`[${sessionId}] Received ${updates.length} contact info updates`);
    // ... 处理逻辑
});

sock.ev.on('groups.update', async (updates) => {
    console.log(`[${sessionId}] Received ${updates.length} group updates`);
    // ... 处理逻辑
});
```

#### 6. 日志改进

所有日志现在都包含 `sessionId` 标识，更容易追踪：

```javascript
console.log(`[${sessionId}] Received ${contacts.length} contact updates`);
console.log(`[${sessionId}] [History] Received ${chats.length} chats...`);
console.log(`[${sessionId}] Downloading ${messageType} for message ${msg.key.id}`);
console.log(`[${sessionId}] ✅ History sync completed!`);
console.log(`[${sessionId}] 🎉 All history has been synced!`);
```

---

### 🚀 部署状态

- ✅ 代码已提交到 Git
- ✅ 代码已推送到 GitHub: https://github.com/ai-caseylai/whatsapp-crm
- ✅ 代码已部署到服务器: whatsapp-crm.techforliving.app
- ✅ 服务已重启并正常运行

---

### 📌 使用建议

1. **重新连接 WhatsApp**：建议登出后重新扫描二维码，以触发完整的历史同步
2. **监控日志**：使用 `ssh whatsapp-crm "pm2 logs whatsapp-bot"` 查看实时日志
3. **检查同步进度**：日志中会显示如 "Saved 50/1000 history messages..."
4. **验证媒体下载**：检查 `/home/ubuntu/whatsapp-bot/data/media/` 目录

---

### 🔧 技术细节

**修改的文件**：
- `server.js` - 主服务器文件（+169 行，-32 行）

**关键改进点**：
1. Socket 配置优化
2. 事件监听器增强
3. 媒体下载逻辑改进
4. 历史同步流程优化
5. 日志系统完善

**性能优化**：
- 批处理大小从 50 降到 25，减少内存压力
- 添加详细日志，便于监控和调试
- 改进错误处理，避免单个失败影响整体

---

### 📞 支持

如有问题，请检查：
1. PM2 日志：`pm2 logs whatsapp-bot`
2. 服务状态：`pm2 status`
3. 数据库记录数：访问 `/api/debug/db-check/sess_id`

---

**更新时间**：2026-02-05  
**版本**：v1.1.0  
**维护者**：ai-caseylai
