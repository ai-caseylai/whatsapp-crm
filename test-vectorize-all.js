async function vectorizeAll() {
    try {
        console.log('🔍 步驟 1: 查詢所有可用的 sessions...');
        
        // 1. 獲取所有活躍的 sessions
        const sessionsResponse = await fetch('http://localhost:3000/api/sessions');
        const sessionsData = await sessionsResponse.json();
        
        console.log(`找到 ${sessionsData.length} 個 session`);
        
        if (sessionsData.length === 0) {
            console.log('❌ 沒有找到任何 session');
            return;
        }
        
        // 找到第一個已連接的 session
        const activeSession = sessionsData.find(s => s.status === 'connected') || sessionsData[0];
        console.log(`\n✅ 使用 Session: ${activeSession.session_id}`);
        console.log(`   狀態: ${activeSession.status}`);
        
        // 2. 構建知識庫並生成所有 embeddings
        console.log('\n🔄 步驟 2: 開始構建知識庫並生成 embeddings...');
        console.log('   這可能需要幾分鐘時間，請耐心等待...\n');
        
        const startTime = Date.now();
        
        const buildResponse = await fetch('http://localhost:3000/api/rag/build-from-all-chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: activeSession.session_id,
                generateEmbeddings: true
            })
        });
        
        const buildData = await buildResponse.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (buildData.success) {
            console.log('✅ 知識庫構建並 Embeddings 生成成功！');
            console.log(`⏱️  耗時: ${duration} 秒\n`);
            console.log('📊 統計資料：');
            console.log(`   👥 聯絡人: ${buildData.statistics.contacts} 個`);
            console.log(`   💬 消息: ${buildData.statistics.messages} 條`);
            console.log(`   📚 知識文檔: ${buildData.statistics.knowledgeDocuments} 條`);
            console.log(`   🧠 Embeddings: ${buildData.statistics.embeddingsCount} 條`);
            console.log(`   📋 聯絡人資料: ${buildData.statistics.contactDocs} 條`);
            console.log(`   💭 對話記錄: ${buildData.statistics.conversationDocs} 條`);
            
            // 3. 測試查詢
            console.log('\n🔍 步驟 3: 測試 RAG 查詢...\n');
            
            const queryResponse = await fetch('http://localhost:3000/api/rag/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question: '我有哪些聯絡人？'
                })
            });
            
            const queryData = await queryResponse.json();
            
            if (queryData.success) {
                console.log('✅ RAG 查詢成功！');
                console.log(`\n💬 問題: 我有哪些聯絡人？`);
                console.log(`\n🎯 答案:\n${queryData.answer}\n`);
            } else {
                console.log('❌ RAG 查詢失敗:', queryData.error);
            }
            
        } else {
            console.log('❌ 構建失敗:', buildData.error);
        }
        
    } catch (error) {
        console.error('❌ 錯誤:', error.message);
    }
}

vectorizeAll();
