// Jina AI RAG 测试脚本
// 运行: node test-rag.js

require('dotenv').config();

const JINA_API_KEY = process.env.JINA_API_KEY;

if (!JINA_API_KEY) {
    console.error('❌ 錯誤：未找到 JINA_API_KEY');
    console.log('請在 .env 文件中設置 JINA_API_KEY');
    process.exit(1);
}

// 测试 Embedding
async function testEmbedding() {
    console.log('\n🧪 測試 Embedding...');
    
    try {
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: ['測試文本：WhatsApp CRM 系統'],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API 錯誤: ${error}`);
        }
        
        const data = await response.json();
        const embedding = data.data[0].embedding;
        
        console.log('✅ Embedding 測試成功！');
        console.log(`   維度: ${embedding.length}`);
        console.log(`   前5個值: [${embedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}...]`);
        
        return true;
    } catch (error) {
        console.error('❌ Embedding 測試失敗:', error.message);
        return false;
    }
}

// 测试 Rerank
async function testRerank() {
    console.log('\n🧪 測試 Rerank...');
    
    const query = '如何使用臨時會話？';
    const documents = [
        'WhatsApp CRM 支持群組管理功能',
        '臨時會話模式不會保存任何數據到數據庫，4小時後自動登出',
        '系統支持批量發送營銷消息',
        '所有聊天記錄會自動保存到數據庫'
    ];
    
    try {
        const response = await fetch('https://api.jina.ai/v1/rerank', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'jina-reranker-v2-base-multilingual',
                query: query,
                documents: documents,
                top_n: 2
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API 錯誤: ${error}`);
        }
        
        const data = await response.json();
        
        console.log('✅ Rerank 測試成功！');
        console.log(`   查詢: "${query}"`);
        console.log('   結果:');
        
        data.results.forEach((result, index) => {
            console.log(`   ${index + 1}. [相關度: ${(result.relevance_score * 100).toFixed(1)}%]`);
            console.log(`      ${result.document.text}`);
        });
        
        return true;
    } catch (error) {
        console.error('❌ Rerank 測試失敗:', error.message);
        return false;
    }
}

// 测试本地 RAG API
async function testLocalRAG() {
    console.log('\n🧪 測試本地 RAG API...');
    
    try {
        const response = await fetch('http://localhost:3000/api/rag/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: 'WhatsApp CRM 有什麼主要功能？'
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ 本地 RAG API 測試成功！');
            console.log(`   答案: ${data.answer.substring(0, 100)}...`);
            console.log(`   來源數: ${data.sources.length}`);
        } else {
            throw new Error(data.error);
        }
        
        return true;
    } catch (error) {
        console.error('❌ 本地 RAG API 測試失敗:', error.message);
        console.log('   提示: 請確保服務器正在運行 (npm start)');
        return false;
    }
}

// 运行所有测试
async function runAllTests() {
    console.log('='.repeat(60));
    console.log('🚀 Jina AI RAG 功能測試');
    console.log('='.repeat(60));
    
    const results = {
        embedding: await testEmbedding(),
        rerank: await testRerank(),
        localRAG: await testLocalRAG()
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 測試結果總結:');
    console.log('='.repeat(60));
    console.log(`Embedding API: ${results.embedding ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`Rerank API:    ${results.rerank ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`本地 RAG API:  ${results.localRAG ? '✅ 通過' : '❌ 失敗'}`);
    
    const allPassed = Object.values(results).every(r => r);
    
    if (allPassed) {
        console.log('\n🎉 所有測試通過！系統已準備就緒。');
        console.log('📌 訪問演示頁面: http://localhost:3000/rag-demo.html');
    } else {
        console.log('\n⚠️  部分測試失敗，請檢查配置和網絡連接。');
    }
    
    console.log('='.repeat(60) + '\n');
}

// 执行测试
runAllTests().catch(console.error);
