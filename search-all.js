// 統一搜索：文字、圖片、視頻、文檔、音頻等所有內容
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 類型圖標
const TYPE_ICONS = {
    'conversation': '💬',
    'contact': '👤',
    'image': '🖼️',
    'video': '🎬',
    'document': '📄',
    'audio': '🎵'
};

async function searchAll(query, options = {}) {
    try {
        const {
            matchCount = 20,
            matchThreshold = 0.2,
            filterType = null  // null = 搜索所有，或指定類型: 'image', 'video', 'document', 'audio', 'conversation'
        } = options;

        console.log('='.repeat(80));
        console.log(`🔍 語義搜索: "${query}"`);
        if (filterType) {
            console.log(`📋 篩選類型: ${filterType}`);
        }
        console.log('='.repeat(80));
        console.log();
        
        // 步驟 1: 生成查詢 embedding
        console.log('步驟 1: 生成查詢向量...');
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                input: [query],
                model: 'jina-embeddings-v2-base-zh'
            })
        });
        
        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }
        
        const data = await response.json();
        const queryEmbedding = data.data[0].embedding;
        console.log(`✅ 查詢向量生成成功\n`);
        
        // 步驟 2: 向量搜索
        console.log('步驟 2: 搜索相關內容...');
        const { data: docs, error } = await supabase.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_threshold: matchThreshold,
            match_count: matchCount
        });
        
        if (error) {
            console.error('❌ 向量搜索錯誤:', error);
            throw error;
        }
        
        // 過濾類型（如果指定）
        let filteredDocs = docs || [];
        if (filterType) {
            filteredDocs = filteredDocs.filter(d => d.source_type === filterType);
        }
        
        console.log(`✅ 找到 ${filteredDocs.length} 個相關結果\n`);
        
        if (filteredDocs.length === 0) {
            console.log('⚠️  沒有找到相關內容');
            console.log('建議:');
            console.log('- 嘗試不同的搜索關鍵詞');
            console.log('- 降低相似度閾值');
            console.log('- 確認已處理相關類型的附件');
            return;
        }
        
        // 按類型分組
        const byType = {};
        filteredDocs.forEach(doc => {
            const type = doc.source_type || 'unknown';
            if (!byType[type]) {
                byType[type] = [];
            }
            byType[type].push(doc);
        });
        
        console.log('='.repeat(80));
        console.log('📊 結果統計:');
        console.log('='.repeat(80));
        Object.entries(byType).forEach(([type, items]) => {
            const icon = TYPE_ICONS[type] || '📎';
            console.log(`${icon} ${type}: ${items.length} 個`);
        });
        console.log('='.repeat(80));
        console.log();
        
        // 顯示結果
        console.log('='.repeat(80));
        console.log('🎯 搜索結果:');
        console.log('='.repeat(80));
        
        filteredDocs.forEach((doc, i) => {
            const similarity = (doc.similarity * 100).toFixed(1);
            const type = doc.source_type || 'unknown';
            const icon = TYPE_ICONS[type] || '📎';
            
            console.log(`\n${i + 1}. ${icon} ${type.toUpperCase()}`);
            console.log(`   相似度: ${similarity}%`);
            
            // 根據類型顯示不同信息
            if (type === 'conversation' || type === 'contact') {
                // 對話和聯絡人
                const contactName = doc.metadata?.contact_name || doc.metadata?.jid || 'Unknown';
                console.log(`   來源: ${contactName}`);
                
                const preview = doc.content.substring(0, 200).replace(/\n/g, '\n   ');
                console.log(`\n   內容:\n   ${preview}...`);
                
            } else {
                // 附件（圖片、視頻、文檔、音頻）
                const contactName = doc.metadata?.contact_name || 'Unknown';
                const timestamp = doc.metadata?.timestamp 
                    ? new Date(doc.metadata.timestamp).toLocaleString('zh-TW')
                    : 'Unknown';
                const mediaUrl = doc.metadata?.media_url || '';
                const caption = doc.metadata?.caption;
                const aiDesc = doc.metadata?.ai_description;
                
                console.log(`   來源: ${contactName}`);
                console.log(`   時間: ${timestamp}`);
                
                if (type === 'image' || type === 'video') {
                    console.log(`   URL: ${mediaUrl}`);
                    if (caption) {
                        console.log(`   原始說明: ${caption}`);
                    }
                    if (aiDesc) {
                        console.log(`\n   📝 AI 描述:`);
                        console.log(`   ${aiDesc}`);
                    }
                } else if (type === 'document') {
                    console.log(`   文件: ${mediaUrl}`);
                    if (caption) {
                        console.log(`   文件名: ${caption}`);
                    }
                } else if (type === 'audio') {
                    console.log(`   音頻: ${mediaUrl}`);
                    if (caption) {
                        console.log(`   說明: ${caption}`);
                    }
                }
            }
            
            console.log('\n' + '-'.repeat(80));
        });
        
        console.log();
        
    } catch (error) {
        console.error('❌ 搜索失敗:', error);
    }
}

// 命令行參數解析
const args = process.argv.slice(2);
const query = args[0];
const filterType = args[1]; // 可選：image, video, document, audio, conversation

if (!query) {
    console.log('使用方法:');
    console.log('  node search-all.js "搜索關鍵詞"              # 搜索所有內容');
    console.log('  node search-all.js "搜索關鍵詞" image        # 只搜索圖片');
    console.log('  node search-all.js "搜索關鍵詞" video        # 只搜索視頻');
    console.log('  node search-all.js "搜索關鍵詞" document     # 只搜索文檔');
    console.log('  node search-all.js "搜索關鍵詞" audio        # 只搜索音頻');
    console.log('  node search-all.js "搜索關鍵詞" conversation # 只搜索對話');
    console.log();
    console.log('示例:');
    console.log('  node search-all.js "帆船"');
    console.log('  node search-all.js "風景照片" image');
    console.log('  node search-all.js "會議記錄" document');
    process.exit(0);
}

const options = {};
if (filterType) {
    const validTypes = ['image', 'video', 'document', 'audio', 'conversation', 'contact'];
    if (!validTypes.includes(filterType)) {
        console.error(`❌ 無效的類型: ${filterType}`);
        console.error(`   有效類型: ${validTypes.join(', ')}`);
        process.exit(1);
    }
    options.filterType = filterType;
}

searchAll(query, options);
