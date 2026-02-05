# WhatsApp CRM System

基于 Baileys 的 WhatsApp Bot 和 CRM 系统。

## 技术栈

- **Node.js** - 运行环境
- **Express** - Web 框架
- **@whiskeysockets/baileys** - WhatsApp Web API
- **Supabase** - 数据库
- **JWT** - 身份验证
- **QRCode** - 二维码生成

## 依赖项

```json
{
  "@hapi/boom": "^10.0.1",
  "@supabase/supabase-js": "^2.94.1",
  "@whiskeysockets/baileys": "^7.0.0-rc.9",
  "bcryptjs": "^3.0.3",
  "cookie-parser": "^1.4.7",
  "dotenv": "^17.2.3",
  "express": "^5.2.1",
  "express-basic-auth": "^1.2.1",
  "jsonwebtoken": "^9.0.3",
  "mime-types": "^3.0.2",
  "multer": "^2.0.2",
  "pino": "^10.3.0",
  "qrcode": "^1.5.4",
  "qrcode-terminal": "^0.12.0"
}
```

## 安装

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 启动服务
npm start
```

## 环境变量

需要在 `.env` 文件中配置以下环境变量：

```
# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# JWT 密钥
JWT_SECRET=your_jwt_secret

# 服务器配置
PORT=3000
```

## 项目结构

```
whatsapp-crm/
├── index.js          # 入口文件
├── server.js         # Express 服务器
├── package.json      # 项目配置
├── public/           # 静态文件
│   └── index.html    # 前端页面
├── auth_info_baileys/  # Baileys 认证信息（不提交到 Git）
├── auth_sessions/    # 会话数据（不提交到 Git）
└── data/             # 数据目录（不提交到 Git）
```

## 部署

本项目部署在 `whatsapp-crm.techforliving.app`

### SSH 连接

```bash
ssh ubuntu@whatsapp-crm.techforliving.app -i ~/.ssh/claw2.pem
```

或使用配置的别名：

```bash
ssh whatsapp-crm
```

## License

ISC
