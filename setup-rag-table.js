// 自動創建 RAG 知識庫表
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function setupTable() {
    console.log('🔧 開始設置 RAG 知識庫表...\n');
    
    try {
        // 嘗試創建表（使用 RPC 或直接查詢）
        console.log('📝 創建 rag_knowledge 表...');
        
        // 先檢查表是否存在
        const { data: existingData, error: checkError } = await supabase
            .from('rag_knowledge')
            .select('id')
            .limit(1);
        
        if (!checkError) {
            console.log('✅ 表已存在！');
            
            // 檢查記錄數
            const { count, error: countError } = await supabase
                .from('rag_knowledge')
                .select('*', { count: 'exact', head: true });
            
            if (!countError) {
                console.log(`📊 當前記錄數: ${count}\n`);
            }
            
            return true;
        }
        
        if (checkError.code === 'PGRST204' || checkError.message.includes('does not exist')) {
            console.log('⚠️  表不存在');
            console.log('\n📋 請在 Supabase SQL Editor 中執行以下 SQL:\n');
            console.log('----------------------------------------');
            console.log('-- 啟用 pgvector 擴展');
            console.log('CREATE EXTENSION IF NOT EXISTS vector;\n');
            console.log('-- 創建 RAG 知識庫表');
            console.log('CREATE TABLE IF NOT EXISTS rag_knowledge (');
            console.log('    id BIGSERIAL PRIMARY KEY,');
            console.log('    content TEXT NOT NULL,');
            console.log('    embedding vector(768),');
            console.log('    session_id TEXT,');
            console.log('    source_type TEXT,');
            console.log('    metadata JSONB,');
            console.log('    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
            console.log('    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
            console.log(');\n');
            console.log('-- 創建索引');
            console.log('CREATE INDEX IF NOT EXISTS idx_rag_knowledge_session_id ON rag_knowledge(session_id);');
            console.log('CREATE INDEX IF NOT EXISTS idx_rag_knowledge_source_type ON rag_knowledge(source_type);');
            console.log('CREATE INDEX IF NOT EXISTS idx_rag_knowledge_created_at ON rag_knowledge(created_at DESC);');
            console.log('----------------------------------------\n');
            console.log('💡 執行完 SQL 後，再次運行此腳本\n');
            return false;
        }
        
        console.error('❌ 檢查表時出錯:', checkError);
        return false;
        
    } catch (error) {
        console.error('❌ 設置失敗:', error.message);
        return false;
    }
}

async function main() {
    const success = await setupTable();
    
    if (success) {
        console.log('✅ 數據庫準備就緒！');
        console.log('🚀 現在可以執行: node sync-vectorize-to-db.js\n');
    } else {
        console.log('⚠️  請先完成數據庫表創建\n');
    }
}

main();
