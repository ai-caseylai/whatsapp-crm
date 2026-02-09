// 處理文檔：PDF、Word、Excel
const { createClient } = require('@supabase/supabase-js');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const JINA_API_KEY = process.env.JINA_API_KEY;
const SESSION_ID = 'sess_id73sa6oi_1770363274857';
const MEDIA_DIR = path.join(__dirname, 'data', 'media');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// PDF 轉文字
async function extractPdfText(filePath) {
    try {
        console.log(`   📄 讀取 PDF...`);
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        
        console.log(`   ✅ 提取完成，共 ${data.numpages} 頁`);
        
        return {
            text: data.text.trim(),
            pages: data.numpages,
            info: data.info
        };
    } catch (error) {
        console.log(`   ❌ PDF 提取失敗: ${error.message}`);
        return null;
    }
}

// Word 轉文字
async function extractWordText(filePath) {
    try {
        console.log(`   📝 讀取 Word 文檔...`);
        const result = await mammoth.extractRawText({ path: filePath });
        
        console.log(`   ✅ 提取完成`);
        
        return {
            text: result.value.trim(),
            messages: result.messages  // 警告和錯誤訊息
        };
    } catch (error) {
        console.log(`   ❌ Word 提取失敗: ${error.message}`);
        return null;
    }
}

// Excel 轉文字
async function extractExcelText(filePath) {
    try {
        console.log(`   📊 讀取 Excel...`);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        let text = '';
        let totalRows = 0;
        
        workbook.eachSheet((worksheet, sheetId) => {
            text += `\n=== 工作表: ${worksheet.name} ===\n\n`;
            
            worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                const values = row.values.slice(1);  // 跳過索引 0
                const rowText = values.map(v => {
                    if (v === null || v === undefined) return '';
                    if (typeof v === 'object' && v.text) return v.text;
                    return String(v);
                }).filter(v => v.trim()).join('\t');
                
                if (rowText.trim()) {
                    text += rowText + '\n';
                    totalRows++;
                }
            });
        });
        
        console.log(`   ✅ 提取完成，共 ${workbook.worksheets.length} 個工作表，${totalRows} 行數據`);
        
        return {
            text: text.trim(),
            sheets: workbook.worksheets.length,
            rows: totalRows
        };
    } catch (error) {
        console.log(`   ❌ Excel 提取失敗: ${error.message}`);
        return null;
    }
}

// 生成 embedding
async function generateEmbedding(text) {
    try {
        // 截斷過長的文字（Jina 限制 8192 tokens）
        const maxLength = 6000;  // 保守估計，約 2000 tokens
        const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        
        const response = await fetch('https://api.jina.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${JINA_API_KEY}`
            },
            body: JSON.stringify({
                input: [truncatedText],
                model: 'jina-embeddings-v2-base-zh'
            })
        });

        if (!response.ok) {
            throw new Error(`Jina API 錯誤: ${await response.text()}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    } catch (error) {
        console.error('   Embedding 生成失敗:', error.message);
        return null;
    }
}

// 主處理函數
async function processDocumentMessages() {
    console.log('='.repeat(80));
    console.log('📄 文檔轉文字處理（PDF、Word、Excel）');
    console.log('='.repeat(80));
    console.log(`📱 Session ID: ${SESSION_ID}`);
    console.log(`💰 成本: 免費！`);
    console.log('='.repeat(80));
    console.log();

    try {
        // 獲取所有文檔消息
        console.log('步驟 1: 查找文檔消息...\n');
        
        let allDocMessages = [];
        let page = 0;
        const PAGE_SIZE = 1000;
        
        while (true) {
            const { data: messages, error } = await supabase
                .from('whatsapp_messages')
                .select('*')
                .eq('session_id', SESSION_ID)
                .eq('message_type', 'documentMessage')
                .not('attachment_path', 'is', null)
                .order('message_timestamp', { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            
            if (error) throw error;
            if (!messages || messages.length === 0) break;
            
            allDocMessages = allDocMessages.concat(messages);
            page++;
            
            if (messages.length < PAGE_SIZE) break;
        }
        
        console.log(`✅ 找到 ${allDocMessages.length} 個文檔\n`);
        
        if (allDocMessages.length === 0) {
            console.log('⚠️  沒有找到文檔消息');
            return;
        }

        // 獲取聯絡人名稱
        console.log('步驟 2: 獲取聯絡人名稱...');
        const jids = [...new Set(allDocMessages.map(m => m.remote_jid))];
        
        let { data: contacts } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify')
            .eq('session_id', SESSION_ID)
            .in('jid', jids);
        
        if (!contacts || contacts.length === 0) {
            const { data: allContacts } = await supabase
                .from('whatsapp_contacts')
                .select('jid, name, notify')
                .in('jid', jids);
            
            const contactMap = new Map();
            allContacts?.forEach(c => {
                if (!contactMap.has(c.jid) || (c.name && !contactMap.get(c.jid).name)) {
                    contactMap.set(c.jid, c);
                }
            });
            contacts = Array.from(contactMap.values());
        }
        
        const contactMap = new Map();
        contacts?.forEach(c => {
            contactMap.set(c.jid, c.name || c.notify || c.jid);
        });
        
        console.log(`✅ 獲取了 ${contacts?.length || 0} 個聯絡人名稱\n`);

        // 處理限制
        const PROCESS_LIMIT = parseInt(process.argv[2]) || allDocMessages.length;
        const messagesToProcess = allDocMessages.slice(0, PROCESS_LIMIT);
        
        console.log(`步驟 3: 處理文檔（前 ${messagesToProcess.length} 個）...\n`);

        const documents = [];
        const stats = {
            total: messagesToProcess.length,
            success: 0,
            failed: 0,
            byType: {
                pdf: 0,
                word: 0,
                excel: 0,
                other: 0
            }
        };

        for (let i = 0; i < messagesToProcess.length; i++) {
            const msg = messagesToProcess[i];
            const contactName = contactMap.get(msg.remote_jid) || msg.remote_jid;
            const fileName = msg.content || path.basename(msg.attachment_path);
            const ext = path.extname(msg.attachment_path).toLowerCase();
            
            console.log(`[${i + 1}/${messagesToProcess.length}] 📄 處理文檔: ${fileName}`);
            console.log(`   來源: ${contactName}`);
            console.log(`   類型: ${ext}`);
            
            try {
                const filePath = path.join(MEDIA_DIR, msg.attachment_path);
                
                if (!fs.existsSync(filePath)) {
                    stats.failed++;
                    console.log(`   ❌ 文件不存在: ${msg.attachment_path}\n`);
                    continue;
                }
                
                let extractedText = '';
                let metadata = {};
                let docType = 'document';
                
                // 根據文件類型選擇提取方法
                if (ext === '.pdf') {
                    const result = await extractPdfText(filePath);
                    if (!result) {
                        stats.failed++;
                        continue;
                    }
                    extractedText = result.text;
                    metadata = { pages: result.pages, pdfInfo: result.info };
                    docType = 'pdf';
                    stats.byType.pdf++;
                    
                } else if (ext === '.docx' || ext === '.doc') {
                    const result = await extractWordText(filePath);
                    if (!result) {
                        stats.failed++;
                        continue;
                    }
                    extractedText = result.text;
                    metadata = { messages: result.messages };
                    docType = 'word';
                    stats.byType.word++;
                    
                } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
                    const result = await extractExcelText(filePath);
                    if (!result) {
                        stats.failed++;
                        continue;
                    }
                    extractedText = result.text;
                    metadata = { sheets: result.sheets, rows: result.rows };
                    docType = 'excel';
                    stats.byType.excel++;
                    
                } else {
                    // 其他文件類型，僅記錄文件名
                    extractedText = `文件名: ${fileName}`;
                    stats.byType.other++;
                    console.log(`   ⚠️  不支援的文件類型: ${ext}`);
                }
                
                if (!extractedText || extractedText.length < 10) {
                    stats.failed++;
                    console.log(`   ❌ 沒有提取到有效內容\n`);
                    continue;
                }
                
                console.log(`   📝 提取文字: ${extractedText.length} 字符`);
                console.log(`   預覽: ${extractedText.substring(0, 80)}...`);
                
                // 構建完整內容
                const timestamp = new Date(msg.message_timestamp).toLocaleString('zh-TW');
                const fullContent = `${contactName} 在 ${timestamp} 分享的文檔《${fileName}》：\n\n${extractedText}`;
                
                // 生成 embedding
                const embedding = await generateEmbedding(fullContent);
                
                if (!embedding) {
                    stats.failed++;
                    console.log(`   ❌ Embedding 失敗\n`);
                    continue;
                }
                
                documents.push({
                    content: fullContent,
                    embedding: embedding,
                    session_id: SESSION_ID,
                    source_type: docType,
                    metadata: {
                        message_id: msg.id || msg.message_id,
                        jid: msg.remote_jid,
                        contact_name: contactName,
                        attachment_path: msg.attachment_path,
                        timestamp: msg.message_timestamp,
                        message_type: msg.message_type,
                        file_name: fileName,
                        file_type: ext,
                        extracted_text_length: extractedText.length,
                        ...metadata
                    }
                });
                
                stats.success++;
                console.log(`   ✅ 完成\n`);
                
                // 延遲避免 rate limit
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                stats.failed++;
                console.log(`   ❌ 處理失敗: ${error.message}\n`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log('\n' + '='.repeat(80));
        console.log('📊 處理統計:');
        console.log('='.repeat(80));
        console.log(`總計: ${stats.total}`);
        console.log(`成功: ${stats.success}`);
        console.log(`失敗: ${stats.failed}`);
        console.log('\n按類型統計:');
        console.log(`   📄 PDF: ${stats.byType.pdf}`);
        console.log(`   📝 Word: ${stats.byType.word}`);
        console.log(`   📊 Excel: ${stats.byType.excel}`);
        console.log(`   📎 其他: ${stats.byType.other}`);
        console.log('='.repeat(80));
        console.log();

        // 保存到數據庫
        if (documents.length > 0) {
            console.log('步驟 4: 保存到知識庫...\n');
            
            let savedCount = 0;
            for (const doc of documents) {
                try {
                    const { error } = await supabase
                        .from('rag_knowledge')
                        .insert(doc);
                    
                    if (error) throw error;
                    savedCount++;
                    
                    if (savedCount % 10 === 0) {
                        console.log(`   已保存 ${savedCount}/${documents.length}...`);
                    }
                } catch (error) {
                    console.error(`   ❌ 保存失敗:`, error.message);
                }
            }
            
            console.log(`\n✅ 保存完成！共保存 ${savedCount} 個文檔\n`);
        }
        
        console.log('='.repeat(80));
        console.log('🎉 文檔處理完成！');
        console.log('='.repeat(80));
        console.log(`✅ 已處理 ${stats.success} 個文檔`);
        console.log(`❌ 失敗 ${stats.failed} 個`);
        console.log(`💰 總成本: $0.00（完全免費！）`);
        console.log('💡 現在可以使用語義搜索查詢文檔內容');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n❌ 執行失敗:', error);
        process.exit(1);
    }
}

// 檢查環境變數
if (!JINA_API_KEY) {
    console.error('❌ 錯誤: 缺少 JINA_API_KEY 環境變數');
    process.exit(1);
}

console.log('💡 提示: 可以指定處理數量，例如: node process-documents.js 20\n');
processDocumentMessages();
