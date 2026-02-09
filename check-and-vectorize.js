// 通过 API 检查并生成所有 embeddings
const http = require('http');

const SERVER_PORT = 3000;

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = body ? JSON.parse(body) : {};
                    resolve({ statusCode: res.statusCode, data: result });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function checkStatus() {
    console.log('🔍 检查服务器状态...');
    try {
        const { statusCode } = await makeRequest('/api/status');
        if (statusCode !== 200) {
            console.log('❌ 服务器未运行，请先启动服务器: node server.js');
            return false;
        }
        console.log('✅ 服务器正在运行');
        return true;
    } catch (error) {
        console.log('❌ 无法连接到服务器，请先启动: node server.js');
        return false;
    }
}

async function generateEmbeddings() {
    console.log('\n🚀 开始生成 embeddings...\n');
    
    try {
        const { statusCode, data } = await makeRequest('/api/rag/generate-embeddings', 'POST');
        
        if (statusCode !== 200) {
            console.error('❌ 生成失败:', data.error || data);
            return;
        }
        
        console.log('\n✅ 生成完成！');
        console.log('\n📊 统计信息:');
        console.log(`   知识库总数: ${data.statistics.totalKnowledge}`);
        console.log(`   成功生成: ${data.statistics.successCount}`);
        console.log(`   失败数量: ${data.statistics.failureCount}`);
        console.log(`   成功率: ${((data.statistics.successCount / data.statistics.totalKnowledge) * 100).toFixed(1)}%`);
        
    } catch (error) {
        console.error('❌ 执行失败:', error.message);
    }
}

async function main() {
    const isRunning = await checkStatus();
    if (!isRunning) {
        process.exit(1);
    }
    
    await generateEmbeddings();
}

main();
