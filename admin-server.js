require('dotenv').config();
const express = require('express');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 9001;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-secret-key';

// 增加 JSON body 限制
app.use(express.json({ limit: '10mb' }));

// API 路由优先（在 static 之前）
app.use('/api', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 简单的认证中间件
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (token === `Bearer ${ADMIN_SECRET}`) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// 执行命令的辅助函数
function executeCommand(command, callback) {
    exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            callback({ error: error.message, stderr });
        } else {
            callback({ stdout, stderr });
        }
    });
}

// 获取 PM2 状态
app.get('/api/admin/status', authenticate, (req, res) => {
    executeCommand('pm2 jlist', (result) => {
        if (result.error) {
            return res.status(500).json(result);
        }
        try {
            const processes = JSON.parse(result.stdout);
            res.json({ processes });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse PM2 output' });
        }
    });
});

// 获取日志
app.get('/api/admin/logs/:service', authenticate, (req, res) => {
    const service = req.params.service;
    const lines = req.query.lines || 50;
    
    if (!['whatsapp-bot', 'whatsapp-webhook'].includes(service)) {
        return res.status(400).json({ error: 'Invalid service name' });
    }
    
    executeCommand(`pm2 logs ${service} --lines ${lines} --nostream`, (result) => {
        res.json(result);
    });
});

// 获取实时日志流
app.get('/api/admin/logs/:service/stream', authenticate, (req, res) => {
    const service = req.params.service;
    
    if (!['whatsapp-bot', 'whatsapp-webhook'].includes(service)) {
        return res.status(400).json({ error: 'Invalid service name' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const logProcess = exec(`pm2 logs ${service} --lines 0`);
    
    logProcess.stdout.on('data', (data) => {
        res.write(`data: ${JSON.stringify({ log: data.toString() })}\n\n`);
    });
    
    logProcess.stderr.on('data', (data) => {
        res.write(`data: ${JSON.stringify({ error: data.toString() })}\n\n`);
    });
    
    req.on('close', () => {
        logProcess.kill();
    });
});

// 获取 Git 历史
app.get('/api/admin/git/history', authenticate, (req, res) => {
    const lines = req.query.lines || 10;
    executeCommand(`cd /home/ubuntu/whatsapp-bot && git log --oneline -${lines}`, (result) => {
        if (result.error) {
            return res.status(500).json(result);
        }
        const commits = result.stdout.trim().split('\n').map(line => {
            const [hash, ...message] = line.split(' ');
            return { hash, message: message.join(' ') };
        });
        res.json({ commits });
    });
});

// 重启服务
app.post('/api/admin/restart/:service', authenticate, (req, res) => {
    const service = req.params.service;
    
    if (!['whatsapp-bot', 'whatsapp-webhook', 'all'].includes(service)) {
        return res.status(400).json({ error: 'Invalid service name' });
    }
    
    const command = service === 'all' ? 'pm2 restart all' : `pm2 restart ${service}`;
    
    executeCommand(command, (result) => {
        if (result.error) {
            return res.status(500).json(result);
        }
        res.json({ success: true, message: `${service} restarted`, output: result.stdout });
    });
});

// 手动触发部署
app.post('/api/admin/deploy', authenticate, (req, res) => {
    executeCommand('/home/ubuntu/whatsapp-bot/deploy.sh', (result) => {
        if (result.error) {
            return res.status(500).json(result);
        }
        res.json({ success: true, output: result.stdout });
    });
});

// 获取系统信息
app.get('/api/admin/system', authenticate, (req, res) => {
    const commands = {
        uptime: 'uptime',
        memory: 'free -h',
        disk: 'df -h /',
        git_branch: 'cd /home/ubuntu/whatsapp-bot && git branch --show-current',
        git_status: 'cd /home/ubuntu/whatsapp-bot && git status --short'
    };
    
    const results = {};
    const promises = Object.keys(commands).map(key => {
        return new Promise((resolve) => {
            executeCommand(commands[key], (result) => {
                results[key] = result.stdout || result.error;
                resolve();
            });
        });
    });
    
    Promise.all(promises).then(() => {
        res.json(results);
    });
});

// 获取媒体列表
app.get('/api/admin/media/list', authenticate, (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const mediaType = req.query.type; // image, video, emoji
    
    // 从数据库获取媒体消息
    executeCommand(`cd /home/ubuntu/whatsapp-bot && node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function getMedia() {
    let query = supabase
        .from('whatsapp_messages')
        .select('message_id, chat_jid, sender_name, content_text, timestamp, media_type, media_path, full_message_json')
        .not('media_type', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(${limit});
    
    ${mediaType ? `query = query.eq('media_type', '${mediaType}');` : ''}
    
    const { data, error } = await query;
    
    if (error) {
        console.error(JSON.stringify({ error: error.message }));
        return;
    }
    
    const media = data.map(msg => ({
        id: msg.message_id,
        chat_jid: msg.chat_jid,
        chat_name: msg.full_message_json?.key?.remoteJid || 'Unknown',
        sender: msg.sender_name || 'Unknown',
        type: msg.media_type,
        path: msg.media_path,
        content: msg.content_text,
        timestamp: msg.timestamp,
        available: !!msg.media_path
    }));
    
    console.log(JSON.stringify({ media }));
}

getMedia();
"`, (result) => {
        if (result.error) {
            return res.status(500).json({ error: result.error });
        }
        try {
            const output = result.stdout.trim().split('\n').pop();
            const data = JSON.parse(output);
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse media data', details: result.stdout });
        }
    });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'WhatsApp CRM Admin Server' });
});

// 获取认证令牌（仅用于演示，生产环境应该更安全）
app.post('/api/admin/auth', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    
    const { password } = req.body;
    if (password === ADMIN_SECRET) {
        res.json({ token: ADMIN_SECRET });
    } else {
        res.status(401).json({ error: 'Invalid password' });
    }
});

app.listen(PORT, () => {
    console.log(`🎛️  管理面板服务器运行在端口 ${PORT}`);
    console.log(`📍 访问: http://localhost:${PORT}/admin.html`);
    console.log(`🔐 Secret: ${ADMIN_SECRET === 'admin-secret-key' ? '⚠️  请设置 ADMIN_SECRET 环境变量' : '✅ 已配置'}`);
});
