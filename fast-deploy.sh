#!/bin/bash
ssh -i ~/.ssh/claw2.pem ubuntu@whatsapp-crm.techforliving.app "cd /home/ubuntu/whatsapp-bot && git pull origin feature/gemini3 && pm2 restart whatsapp-bot --update-env && echo '✅ v1.51.0 部署完成！'"
