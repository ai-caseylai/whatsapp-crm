#!/bin/bash

API_KEY="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"

echo "🧪 测试 OpenRouter API Key..."
echo ""

response=$(curl -s -w "\n%{http_code}" -X POST "https://openrouter.ai/api/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: http://localhost:3000" \
  -H "X-Title: WhatsApp CRM Test" \
  -d '{
    "model": "google/gemini-3-pro-preview",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 20
  }')

# 分离响应体和状态码
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

echo "HTTP 状态码: $http_code"
echo ""
echo "响应内容:"
echo "$body" | jq '.' 2>/dev/null || echo "$body"
echo ""

if [ "$http_code" = "200" ]; then
    echo "✅ API Key 有效！"
else
    echo "❌ API Key 无效或有其他问题"
    
    # 检查具体错误
    if echo "$body" | grep -q "insufficient"; then
        echo "💳 可能是余额不足"
    elif echo "$body" | grep -q "invalid" || echo "$body" | grep -q "unauthorized"; then
        echo "🔑 API Key 认证失败"
    elif echo "$body" | grep -q "rate"; then
        echo "⏰ 速率限制"
    fi
fi
