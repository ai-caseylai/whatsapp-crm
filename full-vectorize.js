// 完整的知识库构建和向量化流程
const http = require('http');

const SERVER_PORT = 3000;
const SESSION_ID = 'sess_9ai6rbwfe_1770361159106'; // 指定的 Session

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

async function buildKnowledgeBase() {
    console.log('📚 第一步: 构建知识库（不生成 embeddings）\n');
    console.log(`使用 Session ID: ${SESSION_ID}\n`);
    
    try {
        const { statusCode, data } = await makeRequest('/api/rag/build-from-all-chats', 'POST', {
            sessionId: SESSION_ID,
            messageLimit: null,  // 不限制消息数
            generateEmbeddings: false  // 先不生成 embeddings
        });
        
        if (statusCode !== 200) {
            console.error('❌ 构建失败:', data.error || data);
            return false;
        }
        
        console.log('✅ 知识库构建完成！\n');
        console.log('📊 统计信息:');
        console.log(`   联系人数: ${data.statistics.contacts}`);
        console.log(`   消息数: ${data.statistics.messages}`);
        console.log(`   知识文档数: ${data.statistics.knowledgeDocuments}`);
        console.log(`     - 联系人文档: ${data.statistics.contactDocs}`);
        console.log(`     - 对话文档: ${data.statistics.conversationDocs}\n`);
        
        return true;
        
    } catch (error) {
        console.error('❌ 构建失败:', error.message);
        return false;
    }
}

async function generateEmbeddings() {
    console.log('🚀 第二步: 生成所有 embeddings\n');
    
    try {
        const { statusCode, data } = await makeRequest('/api/rag/generate-embeddings', 'POST');
        
        if (statusCode !== 200) {
            console.error('❌ 生成失败:', data.error || data);
            return false;
        }
        
        console.log('✅ Embeddings 生成完成！\n');
        console.log('📊 统计信息:');
        console.log(`   总知识条数: ${data.statistics.totalKnowledge || data.statistics.total}`);
        console.log(`   成功生成: ${data.statistics.successCount || data.statistics.success}`);
        console.log(`   失败数量: ${data.statistics.failureCount || data.statistics.failed}`);
        
        const successRate = ((data.statistics.successCount || data.statistics.success) / 
                            (data.statistics.totalKnowledge || data.statistics.total) * 100).toFixed(1);
        console.log(`   成功率: ${successRate}%`);
        console.log(`   向量维度: ${data.statistics.embeddingsDimension}\n`);
        
        return true;
        
    } catch (error) {
        console.error('❌ 生成失败:', error.message);
        return false;
    }
}

async function main() {
    console.log('=' .repeat(60));
    console.log('WhatsApp CRM - 知识库向量化完整流程');
    console.log('=' .repeat(60));
    console.log();
    
    // 步骤 1: 构建知识库
    const buildSuccess = await buildKnowledgeBase();
    if (!buildSuccess) {
        console.error('\n❌ 流程终止：知识库构建失败');
        process.exit(1);
    }
    
    // 等待一秒
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 步骤 2: 生成 embeddings
    const embeddingSuccess = await generateEmbeddings();
    if (!embeddingSuccess) {
        console.error('\n❌ 流程终止：Embeddings 生成失败');
        process.exit(1);
    }
    
    console.log('=' .repeat(60));
    console.log('✅ 完整流程执行成功！');
    console.log('=' .repeat(60));
}

main();
