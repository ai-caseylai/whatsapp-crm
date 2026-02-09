// 快速向量化腳本 - 直接從數據庫查詢並生成所有 embeddings
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    try {
        console.log('🔍 步驟 1: 查詢數據庫中的 sessions...\n');
        
        // 查詢所有 session
        const { data: sessions, error } = await supabase
            .from('whatsapp_sessions')
            .select('session_id, status, created_at')
            .order('created_at', { ascending: false })
            .limit(5);
        
        if (error) throw error;
        
        if (!sessions || sessions.length === 0) {
            console.log('❌ 沒有找到任何 session');
            return;
        }
        
        console.log(`找到 ${sessions.length} 個 session:\n`);
        sessions.forEach((s, i) => {
            console.log(`${i + 1}. ${s.session_id}`);
            console.log(`   狀態: ${s.status}`);
            console.log(`   創建時間: ${s.created_at}\n`);
        });
        
        // 使用第一個 session
        const sessionId = sessions[0].session_id;
        console.log(`✅ 使用 Session: ${sessionId}\n`);
        
        // 調用 API 生成 embeddings
        console.log('🔄 步驟 2: 開始構建知識庫並生成所有 embeddings...');
        console.log('   這可能需要幾分鐘，請耐心等待...\n');
        
        const startTime = Date.now();
        
        const response = await fetch('http://localhost:3000/api/rag/build-from-all-chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: sessionId,
                generateEmbeddings: true
            })
        });
        
        const data = await response.json();
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        if (data.success) {
            console.log('✅ 成功！');
            console.log(`⏱️  耗時: ${duration} 秒\n`);
            console.log('📊 統計資料：');
            console.log(`   👥 聯絡人: ${data.statistics.contacts} 個`);
            console.log(`   💬 消息: ${data.statistics.messages} 條`);
            console.log(`   📚 知識文檔: ${data.statistics.knowledgeDocuments} 條`);
            console.log(`   🧠 Embeddings: ${data.statistics.embeddingsCount} 條`);
            console.log(`   📋 聯絡人資料: ${data.statistics.contactDocs} 條`);
            console.log(`   💭 對話記錄: ${data.statistics.conversationDocs} 條\n`);
            
            console.log('🎉 所有數據已成功向量化！');
        } else {
            console.log('❌ 失敗:', data.error);
        }
        
    } catch (error) {
        console.error('❌ 錯誤:', error.message);
    }
}

main();
