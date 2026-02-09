// 為指定 Session 的所有 WhatsApp 數據生成向量
const http = require('http');

const SERVER_PORT = 3000;
const SESSION_ID = 'sess_9ai6rbwfe_1770361159106';

function makeRequest(path, method = 'GET', data = null, timeout = 300000) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: timeout
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function buildAndVectorize() {
    console.log('=' .repeat(70));
    console.log('🚀 WhatsApp 數據完整向量化流程');
    console.log('=' .repeat(70));
    console.log();
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`⏰ 開始時間: ${new Date().toLocaleString('zh-TW')}`);
    console.log();
    
    try {
        console.log('📚 步驟 1/2: 從 WhatsApp 構建知識庫並生成向量...');
        console.log('   這將包括所有聯絡人和對話記錄');
        console.log('   預計時間: 2-5 分鐘（取決於數據量）');
        console.log();
        
        const startTime = Date.now();
        
        const { statusCode, data } = await makeRequest(
            '/api/rag/build-from-all-chats', 
            'POST', 
            {
                sessionId: SESSION_ID,
                generateEmbeddings: true  // 直接在構建時生成向量
            },
            300000 // 5分鐘超時
        );
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (statusCode !== 200 || !data.success) {
            console.error('❌ 失敗:', data.error || data);
            return false;
        }
        
        console.log('✅ 知識庫構建完成！');
        console.log();
        console.log('📊 統計結果:');
        console.log('-' .repeat(70));
        
        const stats = data.statistics;
        console.log(`👥 聯絡人數量:     ${stats.contacts} 個`);
        console.log(`💬 消息總數:       ${stats.messages} 條`);
        console.log(`📚 知識文檔:       ${stats.knowledgeDocuments} 條`);
        console.log(`   ├─ 聯絡人資料:  ${stats.contactDocs} 條`);
        console.log(`   └─ 對話記錄:    ${stats.conversationDocs} 條`);
        
        if (stats.embeddingsCount !== undefined) {
            console.log(`🧠 向量數量:       ${stats.embeddingsCount} 條`);
            const successRate = ((stats.embeddingsCount / stats.knowledgeDocuments) * 100).toFixed(1);
            console.log(`✨ 向量化成功率:   ${successRate}%`);
        }
        
        console.log('-' .repeat(70));
        console.log(`⏱️  處理時間:       ${duration} 秒`);
        console.log();
        
        return true;
        
    } catch (error) {
        console.error('❌ 執行失敗:', error.message);
        console.log();
        console.log('💡 可能的原因:');
        console.log('   1. 服務器未運行或已崩潰');
        console.log('   2. Session ID 不存在或未連接');
        console.log('   3. 網絡超時（數據量太大）');
        console.log('   4. Jina API 配額用完');
        console.log();
        return false;
    }
}

async function checkStatus() {
    console.log('🔍 步驟 2/2: 驗證向量化結果...');
    console.log();
    
    try {
        const { statusCode, data } = await makeRequest('/api/rag/knowledge-base');
        
        if (statusCode !== 200 || !data.success) {
            console.log('⚠️  無法獲取知識庫狀態');
            return;
        }
        
        console.log('✅ 當前知識庫狀態:');
        console.log(`   總文檔數: ${data.total}`);
        console.log();
        
        if (data.total > 0) {
            console.log('📝 示例文檔（前 3 條）:');
            data.documents.slice(0, 3).forEach((doc, i) => {
                const preview = doc.length > 100 ? doc.substring(0, 100) + '...' : doc;
                console.log(`   ${i + 1}. ${preview}`);
            });
            console.log();
        }
        
    } catch (error) {
        console.log('⚠️  狀態檢查失敗:', error.message);
    }
}

async function main() {
    const success = await buildAndVectorize();
    
    if (success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await checkStatus();
        
        console.log('=' .repeat(70));
        console.log('✅ 向量化流程執行完成！');
        console.log('=' .repeat(70));
        console.log();
        console.log('🎯 下一步:');
        console.log('   1. 訪問 http://localhost:3000/rag-demo.html 測試 RAG 查詢');
        console.log('   2. 在 RAG 演示頁面輸入問題，例如:');
        console.log('      - "最近和誰聊過天？"');
        console.log('      - "客戶問過什麼問題？"');
        console.log('      - "有哪些重要對話？"');
        console.log();
    } else {
        console.log('=' .repeat(70));
        console.log('❌ 向量化流程失敗');
        console.log('=' .repeat(70));
        console.log();
        console.log('🔧 請檢查:');
        console.log('   1. 運行 "ps aux | grep node" 確認服務器在運行');
        console.log('   2. 運行 "tail -50 server.log" 查看服務器日誌');
        console.log('   3. 確認 .env 中的 JINA_API_KEY 正確設置');
        console.log();
        process.exit(1);
    }
}

main();
