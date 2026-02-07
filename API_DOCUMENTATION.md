# Casey CRM API 文档

## 认证

所有 API 请求需要在 HTTP Header 中包含 Bearer Token：

```
Authorization: Bearer casey-crm
```

## 基础信息

- **Base URL**: `https://whatsapp-crm.techforliving.app`
- **默认 Session ID**: `sess_9ai6rbwfe_1770361159106`

---

## API 端点

### 1. 联系人管理

#### 1.1 获取所有联系人
```http
GET /api/crm/contacts?sessionId=sess_9ai6rbwfe_1770361159106
Authorization: Bearer casey-crm
```

**响应示例：**
```json
{
  "success": true,
  "contacts": [
    {
      "jid": "85298765432@s.whatsapp.net",
      "name": "John Doe",
      "custom_name": null,
      "last_message_time": "2026-02-06T10:30:00Z"
    }
  ]
}
```

#### 1.2 导出联系人为 CSV
```http
GET /api/crm/contacts/export?sessionId=sess_9ai6rbwfe_1770361159106
Authorization: Bearer casey-crm
```

**响应：** CSV 文件下载

#### 1.3 从 WhatsApp 刷新联系人名称
```http
POST /api/crm/contacts/refresh
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106"
}
```

**响应示例：**
```json
{
  "success": true,
  "updated": 15,
  "total": 50
}
```

#### 1.4 从群组消息提取联系人名称
```http
POST /api/crm/contacts/extract-names
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106"
}
```

**响应示例：**
```json
{
  "success": true,
  "updated": 23,
  "total": 100
}
```

#### 1.5 清理空联系人
```http
POST /api/crm/contacts/cleanup
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106",
  "includeTraditional": false
}
```

**参数说明：**
- `includeTraditional`: `true` 清理所有空联系人，`false` 只清理 LID 格式的空联系人

**响应示例：**
```json
{
  "success": true,
  "deleted": 12,
  "checked": 50
}
```

---

### 2. 消息管理

#### 2.1 获取消息
```http
GET /api/crm/messages?sessionId=sess_9ai6rbwfe_1770361159106&chatId=85298765432@s.whatsapp.net&limit=50
Authorization: Bearer casey-crm
```

**参数说明：**
- `sessionId`: 会话 ID（可选，默认为默认会话）
- `chatId`: 对话 ID（可选，不提供则返回所有对话的消息）
- `limit`: 返回消息数量（可选，默认 50）

**响应示例：**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg_123",
      "remote_jid": "85298765432@s.whatsapp.net",
      "message_type": "text",
      "text_content": "Hello World",
      "from_me": false,
      "message_timestamp": "2026-02-06T10:30:00Z"
    }
  ]
}
```

#### 2.2 发送单条消息
```http
POST /api/crm/messages/send
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106",
  "recipient": "85298765432@s.whatsapp.net",
  "text": "Hello from API!"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "Message sent"
}
```

#### 2.3 群发消息
```http
POST /api/crm/messages/broadcast
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106",
  "recipients": [
    "85298765432@s.whatsapp.net",
    "85287654321@s.whatsapp.net"
  ],
  "text": "群发消息内容"
}
```

**响应示例：**
```json
{
  "success": true,
  "sent": 2,
  "failed": 0,
  "results": [
    { "recipient": "85298765432@s.whatsapp.net", "success": true },
    { "recipient": "85287654321@s.whatsapp.net", "success": true }
  ]
}
```

---

### 3. 媒体管理

#### 3.1 下载所有媒体
```http
POST /api/crm/media/download-all
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106"
}
```

**响应示例：**
```json
{
  "success": true,
  "downloaded": 45,
  "failed": 3,
  "total": 48
}
```

---

### 4. 同步管理

#### 4.1 强制重新同步
```http
POST /api/crm/sync/force
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106"
}
```

**⚠️ 警告：** 此操作会清除所有现有数据并重新同步

**响应示例：**
```json
{
  "success": true,
  "message": "Sync started. Data cleared, resyncing from WhatsApp."
}
```

---

### 5. LID 映射管理

#### 5.1 获取需要映射的 LID 候选
```http
GET /api/crm/lid/candidates?sessionId=sess_9ai6rbwfe_1770361159106
Authorization: Bearer casey-crm
```

**响应示例：**
```json
{
  "success": true,
  "candidates": [
    {
      "jid": "178099509579845@lid",
      "name": null,
      "total_messages": 187,
      "my_messages": 115
    }
  ]
}
```

#### 5.2 添加 LID 映射
```http
POST /api/crm/lid/mapping
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106",
  "lidJid": "178099509579845@lid",
  "traditionalJid": "85298765432@s.whatsapp.net"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "LID mapping added"
}
```

#### 5.3 自动映射 LID
```http
POST /api/crm/lid/auto-map
Authorization: Bearer casey-crm
Content-Type: application/json

{
  "sessionId": "sess_9ai6rbwfe_1770361159106"
}
```

**响应示例：**
```json
{
  "success": true,
  "mapped": 5,
  "mappings": [
    {
      "session_id": "sess_9ai6rbwfe_1770361159106",
      "lid_jid": "178099509579845@lid",
      "traditional_jid": "85298765432@s.whatsapp.net"
    }
  ]
}
```

---

### 6. 对话列表

#### 6.1 获取对话列表
```http
GET /api/crm/chats?sessionId=sess_9ai6rbwfe_1770361159106&limit=50
Authorization: Bearer casey-crm
```

**参数说明：**
- `limit`: 返回对话数量（可选，默认 50）

**响应示例：**
```json
{
  "success": true,
  "chats": [
    {
      "jid": "85298765432@s.whatsapp.net",
      "name": "John Doe",
      "custom_name": null,
      "last_message_time": "2026-02-06T10:30:00Z"
    }
  ]
}
```

---

### 7. 统计数据

#### 7.1 获取今日发送统计
```http
GET /api/crm/stats/daily?sessionId=sess_9ai6rbwfe_1770361159106
Authorization: Bearer casey-crm
```

**响应示例：**
```json
{
  "success": true,
  "sent": 25,
  "date": "2026-02-06"
}
```

---

## 错误处理

所有 API 在出错时会返回以下格式：

```json
{
  "error": "错误描述信息"
}
```

### HTTP 状态码

- `200 OK`: 请求成功
- `400 Bad Request`: 请求参数错误
- `401 Unauthorized`: 缺少 Authorization Header
- `403 Forbidden`: Token 无效
- `404 Not Found`: 资源不存在
- `500 Internal Server Error`: 服务器错误

---

## 使用示例

### cURL 示例

```bash
# 获取联系人列表
curl -X GET "https://whatsapp-crm.techforliving.app/api/crm/contacts?sessionId=sess_9ai6rbwfe_1770361159106" \
  -H "Authorization: Bearer casey-crm"

# 发送消息
curl -X POST "https://whatsapp-crm.techforliving.app/api/crm/messages/send" \
  -H "Authorization: Bearer casey-crm" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "85298765432@s.whatsapp.net",
    "text": "Hello from API!"
  }'

# 导出联系人 CSV
curl -X GET "https://whatsapp-crm.techforliving.app/api/crm/contacts/export?sessionId=sess_9ai6rbwfe_1770361159106" \
  -H "Authorization: Bearer casey-crm" \
  -o contacts.csv
```

### Python 示例

```python
import requests

API_BASE = "https://whatsapp-crm.techforliving.app"
TOKEN = "casey-crm"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# 获取联系人
response = requests.get(
    f"{API_BASE}/api/crm/contacts",
    params={"sessionId": "sess_9ai6rbwfe_1770361159106"},
    headers=HEADERS
)
contacts = response.json()

# 发送消息
response = requests.post(
    f"{API_BASE}/api/crm/messages/send",
    headers=HEADERS,
    json={
        "recipient": "85298765432@s.whatsapp.net",
        "text": "Hello from Python!"
    }
)
result = response.json()
```

### JavaScript 示例

```javascript
const API_BASE = "https://whatsapp-crm.techforliving.app";
const TOKEN = "casey-crm";

// 获取联系人
async function getContacts() {
  const response = await fetch(
    `${API_BASE}/api/crm/contacts?sessionId=sess_9ai6rbwfe_1770361159106`,
    {
      headers: {
        "Authorization": `Bearer ${TOKEN}`
      }
    }
  );
  return await response.json();
}

// 发送消息
async function sendMessage(recipient, text) {
  const response = await fetch(`${API_BASE}/api/crm/messages/send`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ recipient, text })
  });
  return await response.json();
}
```

---

## 注意事项

1. **Session ID**: 如果不提供 `sessionId`，默认使用 `sess_9ai6rbwfe_1770361159106`
2. **速率限制**: 建议群发消息时控制频率，避免被 WhatsApp 封禁
3. **Token 安全**: 请妥善保管 access token，不要在公开场合泄露
4. **JID 格式**: 
   - 个人联系人：`电话号码@s.whatsapp.net` (如: `85298765432@s.whatsapp.net`)
   - 群组：`群组ID@g.us`
   - LID 格式：`数字ID@lid`

---

## 更新日志

### v1.41.0 (2026-02-06)
- 新增完整的 Casey CRM API
- 支持 Bearer Token 认证 (`casey-crm`)
- 提供 15 个主要功能的 API 端点
