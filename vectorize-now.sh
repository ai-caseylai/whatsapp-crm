#!/bin/bash

echo "🚀 開始向量化所有 WhatsApp 數據..."
echo ""

curl -X POST http://localhost:3000/api/rag/build-from-all-chats \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "sess_ik7ag6i70_1770520366900", "generateEmbeddings": true}' \
  2>/dev/null | python3 -m json.tool

echo ""
echo "✅ 完成！"
