const express = require('express');
const { exec } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = 9000;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'your-webhook-secret-here';

app.use(express.json());

// GitHub Webhook 接收器
app.post('/webhook/deploy', (req, res) => {
    console.log('📨 收到 GitHub Webhook 请求');
    
    // 验证签名（可选但推荐）
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
        const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');
        
        if (signature !== digest) {
            console.log('❌ 签名验证失败');
            return res.status(401).send('Invalid signature');
        }
    }
    
    // 检查是否是 push 事件且推送到 main 分支
    const event = req.headers['x-github-event'];
    const ref = req.body.ref;
    
    console.log(`📌 事件: ${event}, 分支: ${ref}`);
    
    if (event === 'push' && ref === 'refs/heads/main') {
        console.log('🚀 触发自动部署...');
        
        // 立即返回响应
        res.status(200).send('Deployment triggered');
        
        // 异步执行部署
        exec('/home/ubuntu/whatsapp-bot/deploy.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ 部署失败: ${error.message}`);
                console.error(stderr);
                return;
            }
            console.log('✅ 部署成功');
            console.log(stdout);
        });
    } else {
        console.log('⏭️  跳过部署（非 main 分支或非 push 事件）');
        res.status(200).send('Event ignored');
    }
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'WhatsApp CRM Webhook Server' });
});

// 手动触发部署
app.post('/deploy/manual', (req, res) => {
    const token = req.headers['authorization'];
    
    // 简单的令牌验证
    if (token !== `Bearer ${WEBHOOK_SECRET}`) {
        return res.status(401).send('Unauthorized');
    }
    
    console.log('🔧 手动触发部署...');
    res.status(200).send('Manual deployment triggered');
    
    exec('/home/ubuntu/whatsapp-bot/deploy.sh', (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ 部署失败: ${error.message}`);
            console.error(stderr);
            return;
        }
        console.log('✅ 部署成功');
        console.log(stdout);
    });
});

app.listen(PORT, () => {
    console.log(`🎧 Webhook 服务器运行在端口 ${PORT}`);
    console.log(`📍 Webhook URL: http://your-server:9000/webhook/deploy`);
    console.log(`🔐 Secret: ${WEBHOOK_SECRET === 'your-webhook-secret-here' ? '⚠️  请设置 GITHUB_WEBHOOK_SECRET 环境变量' : '已配置'}`);
});
