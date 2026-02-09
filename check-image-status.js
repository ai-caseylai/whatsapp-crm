const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const SESSION_ID = 'sess_id73sa6oi_1770363274857';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkImages() {
    console.log('🔍 檢查圖片消息...\n');
    
    const { count: totalImages } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID)
        .eq('message_type', 'image')
        .not('media_url', 'is', null);
    
    console.log(`📊 總圖片數: ${totalImages}`);
    
    const { count: processedImages } = await supabase
        .from('rag_knowledge')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', SESSION_ID)
        .eq('source_type', 'image');
    
    console.log(`✅ 已處理: ${processedImages}`);
    console.log(`⏳ 待處理: ${totalImages - processedImages}\n`);
    
    if (totalImages === 0) {
        console.log('⚠️  沒有找到圖片消息');
    } else if (processedImages === totalImages) {
        console.log('🎉 所有圖片都已處理完成！');
    } else {
        console.log('💡 準備開始處理圖片...');
    }
}

checkImages().catch(console.error);
