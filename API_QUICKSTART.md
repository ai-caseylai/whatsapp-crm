# Casey CRM API 快速开始

## 认证信息

```
Base URL: https://whatsapp-crm.techforliving.app
Access Token: casey-crm
Session ID: sess_9ai6rbwfe_1770361159106
```

## 快速测试

### 使用 cURL

```bash
# 获取今日统计
curl -X GET "https://whatsapp-crm.techforliving.app/api/crm/stats/daily?sessionId=sess_9ai6rbwfe_1770361159106" \
  -H "Authorization: Bearer casey-crm"

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
```

### 使用测试脚本

```bash
# Bash 测试脚本
./test_api.sh

# Python 测试脚本
python3 test_api.py
```

## 主要功能 API

| 功能 | 方法 | 端点 |
|------|------|------|
| 获取联系人 | GET | `/api/crm/contacts` |
| 导出 CSV | GET | `/api/crm/contacts/export` |
| 获取消息 | GET | `/api/crm/messages` |
| 发送消息 | POST | `/api/crm/messages/send` |
| 群发消息 | POST | `/api/crm/messages/broadcast` |
| 删除消息 | POST | `/api/crm/messages/delete` |
| 撤回消息 | POST | `/api/crm/messages/revoke` |
| 获取对话列表 | GET | `/api/crm/chats` |
| 今日统计 | GET | `/api/crm/stats/daily` |
| 下载媒体 | POST | `/api/crm/media/download-all` |
| 刷新联系人 | POST | `/api/crm/contacts/refresh` |
| 提取名称 | POST | `/api/crm/contacts/extract-names` |
| 清理空联系人 | POST | `/api/crm/contacts/cleanup` |
| LID 候选 | GET | `/api/crm/lid/candidates` |
| 添加 LID 映射 | POST | `/api/crm/lid/mapping` |
| 自动 LID 映射 | POST | `/api/crm/lid/auto-map` |
| 强制同步 | POST | `/api/crm/sync/force` |

## 完整文档

详细的 API 文档请查看：[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)

## 示例代码

### JavaScript/Node.js

```javascript
const API_BASE = "https://whatsapp-crm.techforliving.app";
const TOKEN = "casey-crm";

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

### Python

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

### PHP

```php
<?php
$apiBase = "https://whatsapp-crm.techforliving.app";
$token = "casey-crm";
$headers = [
    "Authorization: Bearer " . $token,
    "Content-Type: application/json"
];

// 获取联系人
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, "$apiBase/api/crm/contacts?sessionId=sess_9ai6rbwfe_1770361159106");
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$contacts = json_decode($response, true);
curl_close($ch);

// 发送消息
$ch = curl_init();
$data = json_encode([
    "recipient" => "85298765432@s.whatsapp.net",
    "text" => "Hello from PHP!"
]);
curl_setopt($ch, CURLOPT_URL, "$apiBase/api/crm/messages/send");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
$result = json_decode($response, true);
curl_close($ch);
?>
```

## 注意事项

1. 所有请求必须包含 `Authorization: Bearer casey-crm` Header
2. Session ID 可选，默认为 `sess_9ai6rbwfe_1770361159106`
3. 电话号码格式：`国家码+号码@s.whatsapp.net`（如：`85298765432@s.whatsapp.net`）
4. 群组格式：`群组ID@g.us`
5. 建议控制群发频率，避免被 WhatsApp 封禁

## 错误处理

所有 API 失败时返回：

```json
{
  "error": "错误描述"
}
```

HTTP 状态码：
- `200`: 成功
- `400`: 参数错误
- `401`: 缺少认证
- `403`: Token 无效
- `500`: 服务器错误

## 技术支持

如有问题，请查看：
- [完整 API 文档](./API_DOCUMENTATION.md)
- [测试脚本示例](./test_api.py)
