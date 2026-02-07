#!/bin/bash

# Casey CRM API 测试脚本
# 使用方法: ./test_api.sh

API_BASE="https://whatsapp-crm.techforliving.app"
TOKEN="casey-crm"
SESSION_ID="sess_9ai6rbwfe_1770361159106"

echo "=========================================="
echo "Casey CRM API 测试"
echo "=========================================="
echo ""

# 1. 获取今日统计
echo "1. 获取今日统计..."
curl -X GET "${API_BASE}/api/crm/stats/daily?sessionId=${SESSION_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -s | jq '.'
echo ""

# 2. 获取对话列表（前5个）
echo "2. 获取对话列表（前5个）..."
curl -X GET "${API_BASE}/api/crm/chats?sessionId=${SESSION_ID}&limit=5" \
  -H "Authorization: Bearer ${TOKEN}" \
  -s | jq '.chats[:5]'
echo ""

# 3. 获取联系人列表（前5个）
echo "3. 获取联系人列表（前5个）..."
curl -X GET "${API_BASE}/api/crm/contacts?sessionId=${SESSION_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -s | jq '.contacts[:5]'
echo ""

# 4. 获取最新消息（前3条）
echo "4. 获取最新消息（前3条）..."
curl -X GET "${API_BASE}/api/crm/messages?sessionId=${SESSION_ID}&limit=3" \
  -H "Authorization: Bearer ${TOKEN}" \
  -s | jq '.messages[:3]'
echo ""

# 5. 测试发送消息（注释掉以防误发）
# echo "5. 发送测试消息..."
# curl -X POST "${API_BASE}/api/crm/messages/send" \
#   -H "Authorization: Bearer ${TOKEN}" \
#   -H "Content-Type: application/json" \
#   -d '{
#     "sessionId": "'"${SESSION_ID}"'",
#     "recipient": "85298765432@s.whatsapp.net",
#     "text": "API 测试消息"
#   }' \
#   -s | jq '.'
# echo ""

echo "=========================================="
echo "测试完成！"
echo "=========================================="
