#!/bin/bash
# WhatsApp CRM 狀態檢查腳本

echo "========================================"
echo "WhatsApp CRM 系統狀態檢查"
echo "時間: $(date)"
echo "========================================"
echo ""

# 檢查 PM2 進程狀態
echo "📊 PM2 進程狀態:"
pm2 list

echo ""
echo "========================================"

# 檢查會話連接狀態
echo ""
echo "🔗 WhatsApp 連接狀態:"
pm2 logs whatsapp-bot --lines 100 --nostream | grep -E '(✅ 連接成功|💓 心跳正常|🔄 將在)' | tail -5

echo ""
echo "========================================"

# 檢查最近的錯誤
echo ""
echo "❌ 最近的錯誤 (如有):"
pm2 logs whatsapp-bot --lines 100 --nostream --err | tail -10

echo ""
echo "========================================"

# 檢查進程重啟次數
echo ""
echo "🔄 進程重啟統計:"
pm2 jlist | jq '.[] | select(.name=="whatsapp-bot") | {
  name: .name,
  status: .pm2_env.status,
  uptime: (.pm2_env.pm_uptime / 1000 / 60 | floor | tostring + " 分鐘"),
  restarts: .pm2_env.restart_time,
  memory: (.monit.memory / 1024 / 1024 | floor | tostring + " MB")
}'

echo ""
echo "========================================"
echo "✅ 檢查完成"
echo "========================================"
