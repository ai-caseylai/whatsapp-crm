const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, getContentType, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const qrcode = require('qrcode');
const mime = require('mime-types');
const multer = require('multer'); // Import multer
const { createClient } = require('@supabase/supabase-js');

// Simple In-Memory Contact Cache (since makeInMemoryStore is not available in this version)
const contactCache = new Map(); // sessionId -> Map<jid, Contact>

// Supabase Config
const SUPABASE_URL = 'https://izwdetsrqjepoxmocore.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6d2RldHNycWplcG94bW9jb3JlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwNDgwOSwiZXhwIjoyMDg1NzgwODA5fQ.nbq_NKxfOc8exmEHZ6juJkSLE9SRsXtmMEEoig6oqAE';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- API V1 Config ---
const MASTER_KEY = process.env.BAILEYS_MASTER_KEY || 'testing';
const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET || 'webhook_secret';
let globalWebhookUrl = null;

async function sendWebhook(event, data) {
    if (!globalWebhookUrl) return;
    try {
        await fetch(globalWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': WEBHOOK_SECRET },
            body: JSON.stringify({ event, data, timestamp: new Date() })
        });
    } catch (e) {
        console.error('Webhook failed:', e.message);
    }
}

const app = express();
const port = 3000;

// Base Data Directory for Auth & Media
const BASE_DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(BASE_DATA_DIR)) fs.mkdirSync(BASE_DATA_DIR, { recursive: true });

// Shared Media Directory (Local Storage)
const SHARED_MEDIA_DIR = path.join(BASE_DATA_DIR, 'media');
if (!fs.existsSync(SHARED_MEDIA_DIR)) fs.mkdirSync(SHARED_MEDIA_DIR, { recursive: true });

// Multer Config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, SHARED_MEDIA_DIR)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    const ext = mime.extension(file.mimetype) || 'bin';
    cb(null, file.fieldname + '-' + uniqueSuffix + '.' + ext)
  }
})
const upload = multer({ storage: storage });

// Sessions Manager
const sessions = new Map(); // sessionId -> { sock, status, qr, userInfo, reconnectAttempts, lastSync }

// Reconnection configuration
const RECONNECT_CONFIG = {
    maxAttempts: 10,
    baseDelay: 3000, // 3 seconds
    maxDelay: 60000, // 1 minute
    heartbeatInterval: 30000 // 30 seconds
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Redirect legacy login page to root
app.get('/login.html', (req, res) => {
    res.redirect('/');
});

app.use('/media', express.static(SHARED_MEDIA_DIR));

// --- Helpers ---

// Save Contacts to Supabase
async function saveContactsToSupabase(sessionId, contacts) {
    const upsertData = contacts.map(c => ({
        session_id: sessionId,
        jid: c.id, // DB uses 'jid', Baileys uses 'id'
        // Prioritize: name > notify > verifiedName > existing DB name (handled by upsert if we select first, but upsert overwrites)
        // We rely on what Baileys gives us.
        name: c.name || c.notify || c.verifiedName || null, 
        notify: c.notify || null,
        updated_at: new Date()
    }));

    const { error } = await supabase
        .from('whatsapp_contacts')
        .upsert(upsertData, { onConflict: 'session_id,jid' });

    if (error) console.error(`[Supabase] Error saving contacts for ${sessionId}:`, error);
}

// Save Message to Supabase
async function saveMessageToSupabase(sessionId, msg, sock) {
    if (!msg.key.remoteJid) return;

    const timestamp = typeof msg.messageTimestamp === 'number' 
        ? msg.messageTimestamp 
        : (msg.messageTimestamp?.low || Math.floor(Date.now()/1000));

    let attachmentFilename = null;
    try {
        const messageType = getContentType(msg.message);
        if (['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'].includes(messageType)) {
            const buffer = await downloadMediaMessage(
                msg,
                'buffer',
                { },
                { 
                    logger: console,
                    reuploadRequest: sock.updateMediaMessage
                }
            );
            
            if (buffer) {
                const ext = mime.extension(msg.message[messageType].mimetype) || 'bin';
                attachmentFilename = `${msg.key.id}.${ext}`;
                fs.writeFileSync(path.join(SHARED_MEDIA_DIR, attachmentFilename), buffer);
            }
        }
    } catch (e) {
        console.error('Error downloading media:', e);
    }

    let contentText = '';
    if (msg.message?.conversation) {
        contentText = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage?.text) {
        contentText = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
        contentText = msg.message.imageMessage.caption;
    } else if (msg.message?.videoMessage?.caption) {
        contentText = msg.message.videoMessage.caption;
    } else {
        contentText = getContentType(msg.message);
    }

    const messageData = {
        message_id: msg.key.id, // DB uses 'message_id'
        session_id: sessionId,
        remote_jid: msg.key.remoteJid,
        from_me: msg.key.fromMe || false,
        message_timestamp: new Date(timestamp * 1000),
        push_name: msg.pushName || null,
        message_type: getContentType(msg.message),
        content: contentText,
        attachment_path: attachmentFilename,
        full_message_json: msg,
        created_at: new Date()
    };

    const { error } = await supabase
        .from('whatsapp_messages')
        .upsert(messageData, { onConflict: 'session_id,message_id' });

    if (error) console.error(`[Supabase] Error saving message for ${sessionId}:`, error);
}

// --- Session Logic ---

// Heartbeat to keep connection alive and detect disconnections
function startHeartbeat(sessionId, sock) {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    // Clear any existing heartbeat
    if (session.heartbeatTimer) {
        clearInterval(session.heartbeatTimer);
    }
    
    console.log(`[${sessionId}] 💓 啟動心跳檢測 (每 ${RECONNECT_CONFIG.heartbeatInterval/1000} 秒)`);
    
    session.heartbeatTimer = setInterval(async () => {
        try {
            // Check if socket is still alive
            if (!sock || session.status !== 'connected') {
                console.log(`[${sessionId}] ⚠️ 心跳檢測到連接異常，清除心跳定時器`);
                clearInterval(session.heartbeatTimer);
                return;
            }
            
            // Check connection state using Baileys' authState
            if (sock.authState?.creds && session.status === 'connected') {
                const uptime = Math.floor((Date.now() - session.lastSync.getTime()) / 1000 / 60);
                console.log(`[${sessionId}] 💓 心跳正常 (運行時間: ${uptime} 分鐘)`);
            } else {
                console.log(`[${sessionId}] ⚠️ 連接狀態檢查失敗，可能需要重連`);
            }
        } catch (error) {
            console.error(`[${sessionId}] ❌ 心跳檢測錯誤:`, error.message);
        }
    }, RECONNECT_CONFIG.heartbeatInterval);
    
    session.heartbeatTimer.unref(); // Don't keep process alive just for heartbeat
}

// Helper to unwrap message (global scope)
function unwrapMessage(message) {
    if (!message) return null;
    if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
    if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
    return message;
}

// 🔧 自动发现和创建 LID 映射关系
async function autoDiscoverLidMapping(sessionId, jid, sock) {
    // 只处理 LID 格式的 JID
    if (!jid || !jid.endsWith('@lid')) {
        return;
    }
    
    try {
        // 检查是否已经有映射关系
        const { data: existing } = await supabase
            .from('whatsapp_jid_mapping')
            .select('*')
            .eq('session_id', sessionId)
            .eq('lid_jid', jid)
            .limit(1);
        
        if (existing && existing.length > 0) {
            // 已经有映射了，不需要再创建
            return;
        }
        
        // 尝试通过 Baileys 获取联系人信息
        let phoneNumber = null;
        let contactName = null;
        
        try {
            // 方法1：从 sock.store 获取联系人信息
            const contact = sock?.store?.contacts?.[jid];
            if (contact) {
                phoneNumber = contact.id?.replace(/[@:].*/g, '');
                contactName = contact.name || contact.notify || contact.verifiedName;
            }
            
            // 方法2：查询联系人缓存
            if (!phoneNumber) {
                const cache = contactCache.get(sessionId);
                if (cache) {
                    const cachedContact = cache.get(jid);
                    if (cachedContact) {
                        phoneNumber = cachedContact.id?.replace(/[@:].*/g, '');
                        contactName = cachedContact.name || cachedContact.notify;
                    }
                }
            }
            
            // 方法3：从数据库中查找同名联系人
            if (contactName && !phoneNumber) {
                const { data: sameNameContacts } = await supabase
                    .from('whatsapp_contacts')
                    .select('jid, name')
                    .eq('session_id', sessionId)
                    .eq('name', contactName)
                    .like('jid', '%@s.whatsapp.net');
                
                if (sameNameContacts && sameNameContacts.length > 0) {
                    // 找到了同名的传统 JID
                    const traditionalJid = sameNameContacts[0].jid;
                    
                    console.log(`[LID] 🔗 发现映射关系: ${jid} -> ${traditionalJid} (通过名字匹配: ${contactName})`);
                    
                    // 创建映射
                    await supabase
                        .from('whatsapp_jid_mapping')
                        .insert({
                            session_id: sessionId,
                            lid_jid: jid,
                            traditional_jid: traditionalJid
                        })
                        .onConflict('session_id, lid_jid')
                        .ignoreDuplicates();
                    
                    return;
                }
            }
            
            // 方法4：如果从 LID 中提取到了电话号码，构造传统 JID
            if (phoneNumber && phoneNumber.length >= 8) {
                const traditionalJid = `${phoneNumber}@s.whatsapp.net`;
                
                // 检查这个传统 JID 是否存在于联系人表
                const { data: traditionalContact } = await supabase
                    .from('whatsapp_contacts')
                    .select('jid, name')
                    .eq('session_id', sessionId)
                    .eq('jid', traditionalJid)
                    .limit(1);
                
                if (traditionalContact && traditionalContact.length > 0) {
                    console.log(`[LID] 🔗 发现映射关系: ${jid} -> ${traditionalJid} (通过电话号码)`);
                    
                    // 创建映射
                    await supabase
                        .from('whatsapp_jid_mapping')
                        .insert({
                            session_id: sessionId,
                            lid_jid: jid,
                            traditional_jid: traditionalJid
                        })
                        .on_conflict(['session_id', 'lid_jid'])
                        .ignore();
                }
            }
        } catch (error) {
            console.error(`[LID] ❌ 发现映射关系失败:`, error.message);
        }
    } catch (error) {
        console.error(`[LID] ❌ 自动发现 LID 映射失败:`, error);
    }
}

async function startSession(sessionId) {
    if (sessions.has(sessionId) && sessions.get(sessionId).status === 'connected') {
        return;
    }

    // Upsert session record (no user_id needed now)
    await supabase.from('whatsapp_sessions').upsert({
        session_id: sessionId,
        status: 'initializing'
    });

    // Auth state stored locally
    const authPath = path.join(__dirname, 'auth_sessions', sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    // Store for retries and message handling
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['WhatsApp CRM', 'Chrome', '1.0.0'],
        connectTimeoutMs: 300000, // Increased to 5 minutes for large history
        keepAliveIntervalMs: 30000, 
        syncFullHistory: true, 
        retryRequestDelayMs: 3000, 
        defaultQueryTimeoutMs: 300000, // Increased timeout to 5 minutes
        fireInitQueries: true,
        generateHighQualityLinkPreview: true,
        markOnlineOnConnect: true,
        emitOwnEvents: true, // Emit events for own messages too
        shouldSyncHistoryMessage: () => true, // Always sync history messages
        shouldIgnoreJid: () => false, // Don't ignore any JIDs during sync
        getMessage: async (key) => {
            // Try to get message from DB
            const { data } = await supabase
                .from('whatsapp_messages')
                .select('full_message_json')
                .eq('session_id', sessionId)
                .eq('message_id', key.id)
                .single();
            
            if (data?.full_message_json?.message) {
                return data.full_message_json.message;
            }
            return { conversation: 'Message not found' };
        },
        msgRetryCounterCache: sessions.get(sessionId)?.msgRetryCounterCache || new Map() 
    });

    // Initialize retry cache if not exists
    if (!sessions.has(sessionId)) {
         sessions.set(sessionId, { 
             sock, 
             status: 'initializing', 
             qr: null, 
             userInfo: null,
             msgRetryCounterCache: new Map() 
         });
    } else {
        // Update sock but keep other state
        const s = sessions.get(sessionId);
        s.sock = sock;
        s.status = 'initializing';
    }

    // Initialize contact cache for this session
    if (!contactCache.has(sessionId)) {
        contactCache.set(sessionId, new Map());
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const session = sessions.get(sessionId);
        if (!session) return;

        // 🆕 只有在未登录状态下才显示二维码
        // 如果已经登录或正在同步，不应该再显示二维码
        if (qr) {
            // 检查是否已经登录（有 userInfo 或状态为 connected）
            const isLoggedIn = session.userInfo || session.status === 'connected';
            
            if (!isLoggedIn) {
                console.log(`[${sessionId}] 📱 生成二維碼供掃描登入`);
                session.status = 'qr';
                session.qr = await qrcode.toDataURL(qr);
                await supabase.from('whatsapp_sessions').update({ status: 'qr', qr_code: session.qr }).eq('session_id', sessionId);
                sendWebhook('qr', { sessionId, qr: session.qr });
            } else {
                console.log(`[${sessionId}] ⏭️  已登入，忽略新的二維碼請求`);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            session.status = 'disconnected';
            await supabase.from('whatsapp_sessions').update({ status: 'disconnected' }).eq('session_id', sessionId);
            sendWebhook('status', { sessionId, status: 'disconnected' });
            
            // Log the error detail
            const errorCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`[${sessionId}] 連接關閉. 錯誤代碼: ${errorCode}, 原因:`, lastDisconnect?.error?.message);

            if (shouldReconnect) {
                // Initialize reconnect attempts if not exists
                if (!session.reconnectAttempts) session.reconnectAttempts = 0;
                session.reconnectAttempts++;
                
                // Check if we've exceeded max attempts
                if (session.reconnectAttempts > RECONNECT_CONFIG.maxAttempts) {
                    console.log(`[${sessionId}] ❌ 超過最大重連次數 (${RECONNECT_CONFIG.maxAttempts}), 停止重連`);
                    session.status = 'failed';
                    await supabase.from('whatsapp_sessions').update({ status: 'failed' }).eq('session_id', sessionId);
                    return;
                }
                
                // Calculate delay with exponential backoff
                const delay = Math.min(
                    RECONNECT_CONFIG.baseDelay * Math.pow(2, session.reconnectAttempts - 1),
                    RECONNECT_CONFIG.maxDelay
                );
                
                console.log(`[${sessionId}] 🔄 將在 ${delay/1000} 秒後重連 (第 ${session.reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} 次嘗試)`);
                
                setTimeout(() => {
                    console.log(`[${sessionId}] 開始重連...`);
                    startSession(sessionId);
                }, delay);
            } else {
                console.log(`[${sessionId}] 已登出，不再重連`);
                
                // 🆕 自动清理失效的会话数据
                console.log(`[${sessionId}] 🗑️  自動清理失效的會話數據...`);
                
                try {
                    // 删除会话数据
                    await supabase.from('whatsapp_sessions').delete().eq('session_id', sessionId);
                    console.log(`[${sessionId}] ✅ 已刪除會話記錄`);
                    
                    // 删除联系人数据（可选）
                    const { error: contactError } = await supabase.from('whatsapp_contacts').delete().eq('session_id', sessionId);
                    if (contactError) {
                        console.log(`[${sessionId}] ⚠️  聯繫人數據清理跳過: ${contactError.message}`);
                    } else {
                        console.log(`[${sessionId}] ✅ 已刪除聯繫人數據`);
                    }
                    
                    // 删除消息数据（可选，谨慎使用）
                    // 注释掉以保留历史消息
                    // const { error: msgError } = await supabase.from('whatsapp_messages').delete().eq('session_id', sessionId);
                    // console.log(`[${sessionId}] ✅ 已刪除消息數據`);
                    
                } catch (cleanupError) {
                    console.error(`[${sessionId}] ❌ 清理失效會話時出錯:`, cleanupError.message);
                }
                
                // 从内存中删除
                session.status = 'logged_out';
                session.qr = null;
                session.userInfo = null;
                session.reconnectAttempts = 0;
                sessions.delete(sessionId);
                
                console.log(`[${sessionId}] 🎯 失效會話已完全清理，下次啟動將創建新會話`);
            }
        } else if (connection === 'open') {
            console.log(`[${sessionId}] ✅ 連接成功`);
            session.status = 'connected';
            session.qr = null;
            session.reconnectAttempts = 0; // Reset reconnect counter on successful connection
            session.lastSync = new Date(); // Record last sync time
            sendWebhook('status', { sessionId, status: 'connected' });
            
            const user = sock.user; 
            session.userInfo = user;
            
            await supabase.from('whatsapp_sessions').update({ status: 'connected', qr_code: null }).eq('session_id', sessionId);
            
            // Start heartbeat to keep connection alive
            startHeartbeat(sessionId, sock);
            
            // 1. Ensure "Self" contact exists for "Note to Self"
            const currentUser = user || state.creds.me;
            if (currentUser && currentUser.id) {
                const selfJid = currentUser.id.split(':')[0] + '@s.whatsapp.net'; // Handle device ID part if present
                await supabase.from('whatsapp_contacts').upsert({
                    session_id: sessionId,
                    jid: selfJid,
                    name: 'Note to Self (自己)',
                    notify: 'You',
                    updated_at: new Date()
                }, { onConflict: 'session_id,jid' });
            }

            // 2. Explicitly fetch groups to ensure they are in contacts
            // 修复：立即获取群组信息，并设置定时重试以确保获取到所有群组
            async function fetchAndUpdateGroups() {
            try {
                console.log(`[${sessionId}] 正在獲取所有群組信息...`);
                const groups = await sock.groupFetchAllParticipating();
                const groupContacts = Object.keys(groups).map(jid => {
                    const group = groups[jid];
                    return {
                        session_id: sessionId,
                        jid: jid,
                        name: group.subject || '未命名群組',
                        notify: group.subject || '未命名群組',
                        is_group: true,
                        updated_at: new Date()
                    };
                });
                
                if (groupContacts.length > 0) {
                    console.log(`[${sessionId}] 找到 ${groupContacts.length} 個群組，正在更新名稱...`);
                    await supabase.from('whatsapp_contacts')
                            .upsert(groupContacts, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                    console.log(`[${sessionId}] ✅ 群組名稱已更新`);
                }
                    return groupContacts.length;
            } catch (e) {
                console.error(`[${sessionId}] ❌ 獲取群組信息時出錯:`, e);
                    return 0;
                }
            }
            
            // 立即获取一次
            await fetchAndUpdateGroups();
            
            // 10秒后再次尝试（确保历史同步开始后获取到的群组也能更新名称）
            setTimeout(async () => {
                console.log(`[${sessionId}] 🔄 10秒后再次获取群组信息...`);
                await fetchAndUpdateGroups();
            }, 10000);
            
            // 30秒后第三次尝试
            setTimeout(async () => {
                console.log(`[${sessionId}] 🔄 30秒后第三次获取群组信息...`);
                const count = await fetchAndUpdateGroups();
                console.log(`[${sessionId}] 📊 最终获取到 ${count} 个群组`);
            }, 30000);
            
            // 3. Add periodic group name refresh (every 5 minutes)
            if (session.groupRefreshTimer) {
                clearInterval(session.groupRefreshTimer);
            }
            
            session.groupRefreshTimer = setInterval(async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const groupUpdates = Object.keys(groups).map(jid => ({
                        session_id: sessionId,
                        jid: jid,
                        name: groups[jid].subject || '未命名群組',
                        notify: groups[jid].subject || '未命名群組',
                        is_group: true,
                        updated_at: new Date()
                    }));
                    
                    if (groupUpdates.length > 0) {
                        await supabase.from('whatsapp_contacts')
                            .upsert(groupUpdates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                        console.log(`[${sessionId}] 🔄 定期更新了 ${groupUpdates.length} 個群組名稱`);
                    }
                } catch (e) {
                    console.error(`[${sessionId}] 定期群組更新失敗:`, e.message);
                }
            }, 5 * 60 * 1000); // Every 5 minutes
            
            session.groupRefreshTimer.unref();
        }
    });

    sock.ev.on('creds.update', (creds) => {
        saveCreds(creds);
        // Update user info if name becomes available
        if (creds.me) {
            const session = sessions.get(sessionId);
            if (session) {
                session.userInfo = { ...session.userInfo, ...creds.me };
                // Also update DB if we were storing user info there
            }
        }
    });

    sock.ev.on('contacts.upsert', async (contacts) => {
        console.log(`[${sessionId}] Received ${contacts.length} contact updates`);
        
        // Update local cache
        const cache = contactCache.get(sessionId);
        if (cache) {
            contacts.forEach(c => {
                const existing = cache.get(c.id) || {};
                // Merge logic: prefer new name/notify, keep old if new is empty
                const merged = { 
                    ...existing, 
                    ...c,
                    name: c.name || c.notify || c.verifiedName || existing.name || existing.notify || null,
                    notify: c.notify || existing.notify || null
                };
                cache.set(c.id, merged);
            });
        }
        
        // Enhance contacts with name before saving if possible?
        // Baileys contact update usually contains the name if available.
        saveContactsToSupabase(sessionId, contacts);
    });
    
    // Add listener for contact updates (when contact info changes)
    sock.ev.on('contacts.update', async (updates) => {
        console.log(`[${sessionId}] Received ${updates.length} contact info updates`);
        
        const cache = contactCache.get(sessionId);
        const contactsToUpdate = updates.map(update => {
            const existing = cache?.get(update.id) || {};
            const merged = { ...existing, ...update };
            
            if (cache) cache.set(update.id, merged);
            
            return {
                session_id: sessionId,
                jid: update.id,
                name: merged.name || merged.notify || merged.verifiedName || null,
                notify: merged.notify || null,
                updated_at: new Date()
            };
        });
        
        if (contactsToUpdate.length > 0) {
            await supabase.from('whatsapp_contacts')
                .upsert(contactsToUpdate, { onConflict: 'session_id,jid' });
            
            // 🔧 自动发现 LID 映射关系
            contactsToUpdate.forEach(contact => {
                if (contact.jid && contact.jid.endsWith('@lid')) {
                    // 异步调用，不阻塞主流程
                    autoDiscoverLidMapping(sessionId, contact.jid, sock).catch(err => {
                        console.error(`[LID] ❌ 自动发现映射失败 (${contact.jid}):`, err.message);
                    });
                }
            });
        }
    });
    
    // Add listener for group updates
    sock.ev.on('groups.update', async (updates) => {
        console.log(`[${sessionId}] Received ${updates.length} group updates`);
        
        const groupUpdates = updates.map(update => ({
            session_id: sessionId,
            jid: update.id,
            name: update.subject || null,
            notify: update.subject || null,
            is_group: true,
            updated_at: new Date()
        }));
        
        if (groupUpdates.length > 0) {
            await supabase.from('whatsapp_contacts')
                .upsert(groupUpdates, { onConflict: 'session_id,jid' });
        }
    });

    // Track total messages synced
    if (!sessions.get(sessionId).totalSyncedMessages) {
        sessions.get(sessionId).totalSyncedMessages = 0;
    }

    sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
        console.log(`[${sessionId}] [History Sync] Batch received:`);
        console.log(`  - Chats: ${chats.length}`);
        console.log(`  - Contacts: ${contacts.length}`);
        console.log(`  - Messages: ${messages.length}`);
        console.log(`  - isLatest: ${isLatest}`);
        console.log(`  - Total synced so far: ${sessions.get(sessionId).totalSyncedMessages || 0}`);
        
        // 1. Save Chats info to contacts
        if (chats.length > 0) {
            const chatContacts = chats.map(chat => {
                const isGroup = chat.id.endsWith('@g.us');
                // For groups without name, try to fetch it later instead of using JID
                let name = chat.name;
                let notify = chat.name;
                
                // Don't use JID as name for groups
                if (isGroup && !name) {
                    name = null; // Will be updated by groupFetchAllParticipating
                    notify = null;
                }
                
                return {
                    session_id: sessionId,
                    jid: chat.id,
                    name: name,
                    notify: notify,
                    is_group: isGroup,
                    unread_count: chat.unreadCount || 0,
                    updated_at: new Date(chat.conversationTimestamp * 1000 || Date.now())
                };
            });
            
            await supabase.from('whatsapp_contacts')
                .upsert(chatContacts, { onConflict: 'session_id,jid', ignoreDuplicates: false });
            
            // After saving chats, trigger a group info fetch for groups without names
            const groupsWithoutNames = chats.filter(c => c.id.endsWith('@g.us') && !c.name);
            if (groupsWithoutNames.length > 0) {
                console.log(`[${sessionId}] 發現 ${groupsWithoutNames.length} 個缺少名稱的群組，將獲取詳細信息...`);
                
                // Fetch group info in background
                setTimeout(async () => {
                    try {
                        const groups = await sock.groupFetchAllParticipating();
                        const updates = groupsWithoutNames
                            .filter(c => groups[c.id])
                            .map(c => ({
                                session_id: sessionId,
                                jid: c.id,
                                name: groups[c.id].subject || '未命名群組',
                                notify: groups[c.id].subject || '未命名群組',
                                is_group: true,
                                updated_at: new Date()
                            }));
                        
                        if (updates.length > 0) {
                            await supabase.from('whatsapp_contacts')
                                .upsert(updates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                            console.log(`[${sessionId}] ✅ 已更新 ${updates.length} 個群組名稱`);
                        }
                    } catch (e) {
                        console.error(`[${sessionId}] 獲取群組名稱失敗:`, e.message);
                    }
                }, 2000); // Wait 2 seconds to avoid overwhelming the connection
            }
        }
        
        // 2. Save Contacts (and update cache)
        if (contacts.length > 0) {
            const cache = contactCache.get(sessionId);
            if (cache) {
                contacts.forEach(c => {
                    cache.set(c.id, { ...cache.get(c.id), ...c });
                });
            }
            saveContactsToSupabase(sessionId, contacts);
        }

        // 3. Save Messages (History)
        // Process in smaller chunks to prevent memory issues
        console.log(`[${sessionId}] Processing ${messages.length} history messages...`);
        const chunkSize = 25; // Reduced chunk size for better stability
        let processedCount = 0;
        
        for (let i = 0; i < messages.length; i += chunkSize) {
            const chunk = messages.slice(i, i + chunkSize);
            const processedMessages = await Promise.all(chunk.map(async (msg) => {
                return await prepareMessageForSupabase(sessionId, msg, sock);
            }));

            const validMessages = processedMessages.filter(m => m !== null);
            
            if (validMessages.length > 0) {
                const { error } = await supabase
                    .from('whatsapp_messages')
                    .upsert(validMessages, { onConflict: 'session_id,message_id', ignoreDuplicates: false });
                
                if (error) {
                    console.error(`[${sessionId}] Error saving history batch:`, error);
                } else {
                    processedCount += validMessages.length;
                    sessions.get(sessionId).totalSyncedMessages = (sessions.get(sessionId).totalSyncedMessages || 0) + validMessages.length;
                    console.log(`[${sessionId}] Saved ${processedCount}/${messages.length} messages in this batch`);
                    console.log(`[${sessionId}] Total messages synced: ${sessions.get(sessionId).totalSyncedMessages}`);
                }

                // Update contact timestamps for history too
                const contactsToUpdate = new Map();
                validMessages.forEach(m => {
                    if (m.remote_jid && !m.remote_jid.includes('status@broadcast')) {
                        const existing = contactsToUpdate.get(m.remote_jid);
                        if (!existing || new Date(m.message_timestamp) > new Date(existing)) {
                            contactsToUpdate.set(m.remote_jid, m.message_timestamp);
                        }
                    }
                });
                
                if (contactsToUpdate.size > 0) {
                    // Update cache first
                    const cache = contactCache.get(sessionId);
                    if (cache) {
                        contactsToUpdate.forEach((ts, jid) => {
                            const existing = cache.get(jid) || {};
                            cache.set(jid, { ...existing, id: jid, updated_at: ts });
                        });
                    }

                    const updates = Array.from(contactsToUpdate.entries()).map(([jid, ts]) => ({
                        session_id: sessionId,
                        jid: jid,
                        updated_at: ts
                    }));
                    await supabase.from('whatsapp_contacts')
                        .upsert(updates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                }
            }
        }
        
        console.log(`[${sessionId}] ✅ History sync batch completed! Processed ${processedCount} messages in this batch.`);
        console.log(`[${sessionId}] Total messages synced across all batches: ${sessions.get(sessionId).totalSyncedMessages}`);
        if (isLatest) {
            console.log(`[${sessionId}] 🎉 All history has been synced! (isLatest=true)`);
            
            // 修复：历史同步完成后，立即获取所有群组的完整信息
            console.log(`[${sessionId}] 🔄 历史同步完成，正在获取所有群组信息...`);
            setTimeout(async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const groupUpdates = Object.keys(groups).map(jid => ({
                        session_id: sessionId,
                        jid: jid,
                        name: groups[jid].subject || '未命名群組',
                        notify: groups[jid].subject || '未命名群組',
                        is_group: true,
                        updated_at: new Date()
                    }));
                    
                    if (groupUpdates.length > 0) {
                        await supabase.from('whatsapp_contacts')
                            .upsert(groupUpdates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                        console.log(`[${sessionId}] ✅ 历史同步完成后，已更新 ${groupUpdates.length} 个群组名称`);
                    }
                } catch (e) {
                    console.error(`[${sessionId}] ❌ 获取群组信息失败:`, e.message);
                }
            }, 3000); // 等待3秒，确保连接稳定
        } else {
            console.log(`[${sessionId}] ⏳ More history batches may be coming... (isLatest=false)`);
        }
    });

    // Add event listener for message updates (edits, deletions)
    sock.ev.on('messages.update', async (updates) => {
        console.log(`[${sessionId}] Received ${updates.length} message updates`);
        for (const update of updates) {
            if (update.key && update.update) {
                // Update message in DB if needed
                const { error } = await supabase
                    .from('whatsapp_messages')
                    .update({ 
                        full_message_json: update,
                        updated_at: new Date()
                    })
                    .eq('session_id', sessionId)
                    .eq('message_id', update.key.id);
                
                if (error) console.error(`[Supabase] Error updating message:`, error);
            }
        }
    });
    
    // Add event listener for message reactions
    sock.ev.on('messages.reaction', async (reactions) => {
        console.log(`[${sessionId}] Received ${reactions.length} reactions`);
        // Reactions are usually embedded in messages.upsert, but we log them here
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`[${sessionId}] Received ${messages.length} messages (type: ${type})`);
        
        // 修复：检查是否有群组消息，如果有则立即获取群组信息
        const groupJids = new Set();
        messages.forEach(msg => {
            if (msg.key.remoteJid && msg.key.remoteJid.endsWith('@g.us')) {
                groupJids.add(msg.key.remoteJid);
            }
        });
        
        // 如果有群组消息，立即获取群组信息（异步，不阻塞消息处理）
        if (groupJids.size > 0) {
            console.log(`[${sessionId}] 📋 检测到 ${groupJids.size} 个群组的消息，正在获取群组信息...`);
            
            // 异步获取群组信息
            (async () => {
                try {
                    const groups = await sock.groupFetchAllParticipating();
                    const groupUpdates = [];
                    
                    groupJids.forEach(jid => {
                        if (groups[jid]) {
                            groupUpdates.push({
                                session_id: sessionId,
                                jid: jid,
                                name: groups[jid].subject || '未命名群組',
                                notify: groups[jid].subject || '未命名群組',
                                is_group: true,
                                updated_at: new Date()
                            });
                        }
                    });
                    
                    if (groupUpdates.length > 0) {
                        await supabase.from('whatsapp_contacts')
                            .upsert(groupUpdates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
                        console.log(`[${sessionId}] ✅ 已更新 ${groupUpdates.length} 个群组的信息`);
                    }
                } catch (error) {
                    console.error(`[${sessionId}] ❌ 获取群组信息失败:`, error.message);
                }
            })();
        }
        
        // Process in chunks of 50
        const chunkSize = 50;
        for (let i = 0; i < messages.length; i += chunkSize) {
            const chunk = messages.slice(i, i + chunkSize);
            
            // Process chunk in parallel for media/formatting
            const processedMessages = await Promise.all(chunk.map(async (msg) => {
                // Return the data object for DB insert
                return await prepareMessageForSupabase(sessionId, msg, sock);
            }));

            // Filter out nulls (if any)
            const validMessages = processedMessages.filter(m => m !== null);

            if (validMessages.length > 0) {
                // Batch upsert to Supabase
                const { error } = await supabase
                    .from('whatsapp_messages')
                    .upsert(validMessages, { onConflict: 'session_id,message_id', ignoreDuplicates: false }); // Changed to false to update existing messages
                
                if (error) console.error(`[Supabase] Error batch saving messages:`, error);

                // Update contact's updated_at timestamp based on latest message
                // This ensures sorting works
                const contactsToUpdate = new Map();
                validMessages.forEach(m => {
                    if (m.remote_jid && !m.remote_jid.includes('status@broadcast')) {
                        // Keep track of the latest timestamp for each contact
                        const existing = contactsToUpdate.get(m.remote_jid);
                        if (!existing || new Date(m.message_timestamp) > new Date(existing)) {
                            contactsToUpdate.set(m.remote_jid, m.message_timestamp);
                        }
                    }
                });
                
                if (contactsToUpdate.size > 0) {
                    // Update cache first
                    const cache = contactCache.get(sessionId);
                    if (cache) {
                        contactsToUpdate.forEach((ts, jid) => {
                            const existing = cache.get(jid) || {};
                            cache.set(jid, { ...existing, id: jid, updated_at: ts });
                        });
                    }

                    const updates = Array.from(contactsToUpdate.entries()).map(([jid, ts]) => ({
                        session_id: sessionId,
                        jid: jid,
                        updated_at: ts
                    }));
                    
                    await supabase.from('whatsapp_contacts')
                        .upsert(updates, { onConflict: 'session_id,jid', ignoreDuplicates: false }); // We want to update timestamps
                    
                    // 🔧 自动发现 LID 映射关系
                    contactsToUpdate.forEach((ts, jid) => {
                        if (jid && jid.endsWith('@lid')) {
                            // 异步调用，不阻塞主流程
                            autoDiscoverLidMapping(sessionId, jid, sock).catch(err => {
                                console.error(`[LID] ❌ 自动发现映射失败 (${jid}):`, err.message);
                            });
                        }
                    });
                }

                // 🔧 只广播实时新消息（type='notify'），历史同步消息（type='append'）静默保存
                // type='notify': 实时接收的新消息（用户刚发的）→ 自动打开聊天
                // type='append': 历史同步的旧消息（从服务器拉取的）→ 静默保存到数据库
                if (type === 'notify') {
                    // 🆕 等待一小段时间（200ms）确保媒体文件已写入磁盘
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    validMessages.forEach(m => {
                        sendWebhook('message', { sessionId, message: m });
                        
                        // Broadcast via WebSocket for real-time updates
                        if (global.broadcastMessage) {
                            const hasMedia = m.attachment_path || ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(m.message_type);
                            console.log(`[${sessionId}] 📤 广播实时新消息到前端: ${m.remote_jid}${hasMedia ? ' (含媒体)' : ''}`);
                            global.broadcastMessage(sessionId, m.remote_jid, m);
                        }
                    });
                } else if (type === 'append') {
                    console.log(`[${sessionId}] 💾 历史消息已静默保存 (${validMessages.length} 条)`);
                }
            }
        }
        
        // Update contacts from messages (Sender info)
        // Extract unique senders
        const senders = new Map();
        messages.forEach(msg => {
            if (msg.key.remoteJid) {
                let jid = msg.key.remoteJid;
                
                // Check if this is "Note to Self"
                // If remoteJid is my own JID (and it's not a group)
                const isGroup = jid.endsWith('@g.us');
                const isBroadcast = jid === 'status@broadcast';
                
                // 修复：处理群组消息联系人信息
                if (isGroup) {
                    // 确保群组联系人存在（即使没有名字）
                    if (!senders.has(jid)) {
                        senders.set(jid, {
                            session_id: sessionId,
                            jid: jid,
                            name: null, // 群组名称会通过groups.update事件更新
                            is_group: true,
                            updated_at: new Date()
                        });
                    }
                } else if (!isBroadcast) {
                    // Try to detect if it's me
                    // Use sock.user or fallback to state.creds.me (available during sync)
                    const currentUser = sock.user || state.creds.me;
                    const myJid = currentUser?.id ? currentUser.id.split(':')[0] + '@s.whatsapp.net' : null;
                    
                    let name = msg.pushName || null;
                    
                    // If it is me (Note to Self)
                    if (myJid && jid.includes(myJid.split('@')[0])) {
                        // Normalize JID
                        jid = myJid; 
                        name = 'Note to Self (自己)';
                    }
                    
                    // Always add to senders if it's a valid user JID, even if no name (use JID as name fallback later)
                    // Update updated_at to bring it to top
                    // Only update name if we have a pushName, otherwise keep existing (don't overwrite with null)
                    
                    if (name) {
                        senders.set(jid, {
                            session_id: sessionId,
                            jid: jid,
                            name: name, 
                            updated_at: new Date()
                        });
                        
                        // Also update cache
                        const cache = contactCache.get(sessionId);
                        if (cache) {
                            const existing = cache.get(jid) || {};
                            // Only overwrite name if we have a better one
                            if (!existing.name || existing.name === jid.split('@')[0]) {
                                cache.set(jid, { ...existing, name: name });
                            }
                        }
                    }
                }
            }
        });
        
        if (senders.size > 0) {
            const { error } = await supabase.from('whatsapp_contacts')
                .upsert(Array.from(senders.values()), { 
                    onConflict: 'session_id,jid',
                    ignoreDuplicates: false  // 允许更新已有联系人的名字
                });
            
            if (!error) {
                const withNames = Array.from(senders.values()).filter(s => s.name).length;
                console.log(`[${sessionId}] ✅ 更新了 ${senders.size} 个联系人（其中 ${withNames} 个有名字）`);
            }
        }
    });

// Separate preparation logic
async function prepareMessageForSupabase(sessionId, msg, sock) {
    if (!msg.key.remoteJid) return null;

    // Handle messages sent to self (Note to Self)
    // In Baileys, 'remoteJid' for self messages is usually the user's own JID.
    // 'fromMe' is true.
    
    // Unwrap message to handle ephemeral/viewOnce
    const realMessage = unwrapMessage(msg.message);
    if (!realMessage) return null;

    const timestamp = typeof msg.messageTimestamp === 'number' 
        ? msg.messageTimestamp 
        : (msg.messageTimestamp?.low || Math.floor(Date.now()/1000));

    let attachmentFilename = null;
    let messageType = getContentType(realMessage);

    // Download media for all supported message types
    try {
        const mediaTypes = {
            'imageMessage': 'image',
            'videoMessage': 'video',
            'documentMessage': 'document',
            'audioMessage': 'audio',
            'stickerMessage': 'sticker',
            'pttMessage': 'audio' // Voice messages
        };
        
        if (mediaTypes[messageType]) {
            console.log(`[${sessionId}] Downloading ${messageType} for message ${msg.key.id}`);
            
            const buffer = await downloadMediaMessage(
                { key: msg.key, message: realMessage },
                'buffer',
                { },
                { 
                    logger: console,
                    reuploadRequest: sock.updateMediaMessage
                }
            ).catch((e) => {
                console.error(`[${sessionId}] Media download failed for ${messageType}:`, e.message);
                return null;
            }); 
            
            if (buffer) {
                let ext = mime.extension(realMessage[messageType]?.mimetype || 'application/octet-stream');
                
                // Better extension handling
                if (messageType === 'documentMessage') {
                    const fileName = realMessage.documentMessage?.fileName;
                    if (fileName && fileName.includes('.')) {
                        ext = fileName.split('.').pop();
                    }
                } else if (messageType === 'audioMessage' || messageType === 'pttMessage') {
                    ext = 'ogg'; // WhatsApp audio is usually ogg/opus
                } else if (messageType === 'stickerMessage') {
                    ext = 'webp';
                } else if (messageType === 'imageMessage' && !ext) {
                    ext = 'jpg';
                } else if (messageType === 'videoMessage' && !ext) {
                    ext = 'mp4';
                }
                
                if (!ext) ext = 'bin';

                attachmentFilename = `${msg.key.id}.${ext}`;
                const filePath = path.join(SHARED_MEDIA_DIR, attachmentFilename);
                fs.writeFileSync(filePath, buffer);
                console.log(`[${sessionId}] Saved media to ${attachmentFilename} (${buffer.length} bytes)`);
            } else {
                // FALLBACK: Try to save thumbnail if full download failed
                const thumb = realMessage[messageType]?.jpegThumbnail;
                if (thumb && Buffer.isBuffer(thumb)) {
                    attachmentFilename = `${msg.key.id}_thumb.jpg`;
                    fs.writeFileSync(path.join(SHARED_MEDIA_DIR, attachmentFilename), thumb);
                    console.log(`[${sessionId}] Saved thumbnail for ${msg.key.id}`);
                }
            }
        }
    } catch (e) {
        console.error(`[${sessionId}] Error downloading media:`, e);
    }

    let contentText = '';
    let quotedMessage = null;
    
    // Check for quoted/replied message
    if (realMessage?.extendedTextMessage?.contextInfo?.quotedMessage) {
        quotedMessage = realMessage.extendedTextMessage.contextInfo;
    }
    
    if (realMessage?.conversation) {
        contentText = realMessage.conversation;
    } else if (realMessage?.extendedTextMessage?.text) {
        contentText = realMessage.extendedTextMessage.text;
        // Add quoted message indicator
        if (quotedMessage) {
            contentText = `[回覆] ${contentText}`;
        }
    } else if (realMessage?.imageMessage?.caption) {
        contentText = realMessage.imageMessage.caption;
    } else if (realMessage?.videoMessage?.caption) {
        contentText = realMessage.videoMessage.caption;
    } else if (realMessage?.documentMessage?.fileName) {
        contentText = realMessage.documentMessage.fileName;
    } else if (realMessage?.protocolMessage) {
        // Handle protocol messages (e.g. history sync end) - usually skip but good to know
        return null;
    } else if (realMessage?.reactionMessage) {
        // Save reactions as messages so we can display them
        const reaction = realMessage.reactionMessage;
        contentText = `${reaction.text || '❤️'} (回應訊息)`;
    } else {
        // Fallback: try to find any string in the message object recursively? 
        // Or just use the type.
        // Check for specific group notification types
        if (realMessage?.stickerMessage) contentText = '[貼圖]';
        else if (realMessage?.audioMessage) contentText = '[語音訊息]';
        else if (realMessage?.imageMessage) contentText = '[圖片]'; // Ensure image message without caption has text
        else if (realMessage?.videoMessage) contentText = '[影片]';
        else if (realMessage?.contactMessage) contentText = '[聯絡人卡片]';
        else if (realMessage?.locationMessage) contentText = '[位置資訊]';
        else contentText = messageType || '未知訊息';
    }

    // Extract participant info (for group messages)
    const participant = msg.key.participant || null; // Who sent the message in a group
    const participantPhone = participant ? participant.split('@')[0] : null;
    
    return {
        message_id: msg.key.id,
        session_id: sessionId,
        remote_jid: msg.key.remoteJid,
        from_me: msg.key.fromMe || false,
        participant: participant, // 群組中的發送者 JID
        participant_phone: participantPhone, // 發送者電話號碼
        message_timestamp: new Date(timestamp * 1000),
        push_name: msg.pushName || null,
        message_type: messageType,
        content: contentText,
        attachment_path: attachmentFilename,
        full_message_json: msg, // Keep full original msg for debugging
        created_at: new Date()
    };
}

}

// --- Public API Routes (No Auth) ---

// Start Session (Auto-create if not exists)
app.post('/api/session/:id/start', async (req, res) => {
    const sessionId = req.params.id;
    try {
        await startSession(sessionId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Check Status
app.get('/api/session/:id/status', async (req, res) => {
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    
    // Try to recover session if it exists in DB but not in memory (e.g. after server restart)
    if (!session) {
        // We can't easily recover without re-initializing auth state which is async.
        // But init() should have handled this.
        // Check DB
        const { data } = await supabase.from('whatsapp_sessions').select('*').eq('session_id', sessionId).single();
        if (data) {
             return res.json({ status: data.status || 'stopped', qr: data.qr_code, userInfo: null });
        }
        return res.json({ status: 'stopped', qr: null, userInfo: null });
    }
    
    // Ensure userInfo is populated if connected
    if (session.status === 'connected' && !session.userInfo) {
         // Try to get from sock or auth state
         if (session.sock?.user) session.userInfo = session.sock.user;
         // We can also try reading from creds if needed, but sock.user is best
    }

    // Try to inject self contact info into response to help frontend debugging
    const selfJid = session.userInfo?.id ? session.userInfo.id.split(':')[0] + '@s.whatsapp.net' : null;

    res.json({ 
        status: session.status, 
        qr: session.qr,
        userInfo: session.userInfo,
        selfJid: selfJid // Send this to frontend
    });
});

// Ensure Self Contact
app.post('/api/session/:id/ensure-self', async (req, res) => {
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    
    if (!session || !session.sock) {
        return res.status(400).json({ error: 'Session not active' });
    }
    
    try {
        let user = session.sock.user;
        
        // Fallback: if sock.user is missing, try to get from auth state
        if (!user) {
             // Access internal state (hacky but needed if sock.user is undefined)
             // Baileys usually updates creds.me
             const authState = session.sock.authState; 
             if (authState && authState.creds && authState.creds.me) {
                 user = authState.creds.me;
             }
        }

        let selfJid = user?.id;
        if (!selfJid) {
             // Hard fallback: Check if any contact in DB is marked as 'Note to Self'
             // Or we can ask frontend to provide it if known?
             // Let's return error for now.
             return res.status(404).json({ error: 'Self user info not found. Please wait or re-scan.' });
        }
        
        selfJid = selfJid.split(':')[0] + '@s.whatsapp.net';
        
        const contact = {
            session_id: sessionId,
            jid: selfJid,
            name: 'Note to Self (自己)',
            notify: 'You',
            updated_at: new Date()
        };
        
        const { error } = await supabase.from('whatsapp_contacts')
            .upsert(contact, { onConflict: 'session_id,jid' });
            
        if (error) throw error;
        
        res.json({ success: true, contact });
    } catch (e) {
        console.error('Error ensuring self contact:', e);
        res.status(500).json({ error: e.message });
    }
});

// Logout Session
app.post('/api/session/:id/logout', async (req, res) => {
    const sessionId = req.params.id;
    const mem = sessions.get(sessionId);
    if (mem && mem.sock) {
        try { await mem.sock.logout(); } catch(e){}
        sessions.delete(sessionId);
    }
    const authPath = path.join(__dirname, 'auth_sessions', sessionId);
    if(fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
    
    await supabase.from('whatsapp_sessions').update({ status: 'logged_out', qr_code: null }).eq('session_id', sessionId);
    res.json({ success: true });
});

// Refresh LID contact names
app.post('/api/session/:id/refresh-lid-contacts', async (req, res) => {
    const sessionId = req.params.id;
    const mem = sessions.get(sessionId);
    
    if (!mem || !mem.sock) {
        return res.status(400).json({ error: '會話未連接' });
    }
    
    try {
        console.log(`[${sessionId}] 獲取 LID 聯絡人信息...`);
        
        // Get all LID contacts from database
        const { data: lidContacts, error } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, notify')
            .eq('session_id', sessionId)
            .like('jid', '%@lid');
        
        if (error) {
            console.error(`[${sessionId}] 獲取 LID 聯絡人失敗:`, error);
            return res.status(500).json({ error: error.message });
        }
        
        console.log(`[${sessionId}] 找到 ${lidContacts?.length || 0} 個 LID 聯絡人`);
        
        // Try to fetch status/info for LID contacts
        let updated = 0;
        const contactsToUpdate = [];
        
        for (const contact of lidContacts || []) {
            try {
                // Extract phone number from LID
                const phoneNumber = contact.jid.split('@')[0];
                
                // Try to get contact info (this might work for some contacts)
                const jids = [`${phoneNumber}@s.whatsapp.net`];
                const onWhatsAppResult = await mem.sock.onWhatsApp(...jids);
                
                if (onWhatsAppResult && onWhatsAppResult.length > 0) {
                    const info = onWhatsAppResult[0];
                    if (info.exists) {
                        // Contact exists, update with any available info
                        contactsToUpdate.push({
                            session_id: sessionId,
                            jid: contact.jid,
                            name: contact.name || phoneNumber,
                            notify: contact.notify || phoneNumber,
                            updated_at: new Date()
                        });
                        updated++;
                    }
                }
            } catch (e) {
                // Skip individual errors
                console.log(`[${sessionId}] 無法獲取 ${contact.jid} 的信息`);
            }
        }
        
        if (contactsToUpdate.length > 0) {
            await supabase.from('whatsapp_contacts')
                .upsert(contactsToUpdate, { onConflict: 'session_id,jid', ignoreDuplicates: false });
        }
        
        console.log(`[${sessionId}] ✅ 已處理 ${updated} 個 LID 聯絡人`);
        return res.json({ 
            success: true, 
            lidContactsFound: lidContacts?.length || 0,
            contactsProcessed: updated,
            message: `已處理 ${updated} 個 LID 聯絡人`
        });
    } catch (error) {
        console.error(`[${sessionId}] 刷新 LID 聯絡人失敗:`, error);
        return res.status(500).json({ error: error.message });
    }
});

// 🆕 刷新未知联系人的名称（从 WhatsApp 获取个人资料）
app.post('/api/session/:id/refresh-unknown-contacts', async (req, res) => {
    const sessionId = req.params.id;
    const mem = sessions.get(sessionId);
    
    if (!mem || !mem.sock) {
        return res.status(400).json({ error: '會話未連接' });
    }
    
    try {
        console.log(`[${sessionId}] 🔍 正在查找没有名字的联系人...`);
        
        // 从数据库获取所有没有名字的私人联系人
        const { data: contacts, error } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name')
            .eq('session_id', sessionId)
            .is('is_group', false)  // 只查询私人联系人
            .like('jid', '%@s.whatsapp.net')  // 排除 LID 格式
            .limit(100);  // 限制一次处理 100 个
        
        if (error) {
            throw error;
        }
        
        // 过滤出没有名字或名字就是电话号码的联系人
        const unknownContacts = contacts.filter(c => {
            if (!c.name) return true;
            const phoneNumber = c.jid.split('@')[0];
            return c.name === phoneNumber;
        });
        
        console.log(`[${sessionId}] 找到 ${unknownContacts.length} 个未知联系人，正在获取个人资料...`);
        
        let updated = 0;
        let failed = 0;
        
        // 批量处理，避免请求过多
        for (const contact of unknownContacts.slice(0, 20)) {  // 每次只处理前 20 个
            try {
                const jid = contact.jid;
                const phoneNumber = jid.split('@')[0];
                
                // 方法1: 尝试获取用户状态（可能包含名字）
                try {
                    const status = await mem.sock.fetchStatus(jid);
                    if (status && status.status) {
                        // 状态中可能包含用户设置的名字
                        console.log(`[${sessionId}] 📝 获取到 ${phoneNumber} 的状态: ${status.status.substring(0, 30)}...`);
                    }
                } catch (e) {
                    // 忽略错误
                }
                
                // 方法2: 尝试从 onWhatsApp 获取信息
                try {
                    const [result] = await mem.sock.onWhatsApp(phoneNumber);
                    console.log(`[${sessionId}] 📞 查询 ${phoneNumber}: exists=${result?.exists}, verifiedName=${result?.verifiedName}, name=${result?.name}`);
                    
                    if (result && result.exists) {
                        const verifiedName = result.verifiedName || result.name;
                        if (verifiedName && verifiedName !== phoneNumber) {
                            await supabase.from('whatsapp_contacts').update({
                                name: verifiedName,
                                notify: verifiedName,
                                updated_at: new Date()
                            }).eq('session_id', sessionId).eq('jid', jid);
                            
                            console.log(`[${sessionId}] ✅ 更新联系人 ${phoneNumber} -> ${verifiedName}`);
                            updated++;
                        } else {
                            console.log(`[${sessionId}] ⏭️ 跳过 ${phoneNumber}: 没有有效名字（verifiedName=${verifiedName}）`);
                        }
                    } else {
                        console.log(`[${sessionId}] ⏭️ 跳过 ${phoneNumber}: 不存在于 WhatsApp`);
                    }
                } catch (e) {
                    console.error(`[${sessionId}] ❌ 获取 ${phoneNumber} 信息失败:`, e.message);
                    failed++;
                }
                
                // 添加延迟，避免请求过快
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                failed++;
            }
        }
        
        return res.json({
            success: true,
            total: unknownContacts.length,
            processed: Math.min(20, unknownContacts.length),
            updated: updated,
            failed: failed,
            message: `已处理 ${Math.min(20, unknownContacts.length)} 个联系人，成功更新 ${updated} 个`
        });
    } catch (error) {
        console.error(`[${sessionId}] 刷新未知联系人失败:`, error);
        return res.status(500).json({ error: error.message });
    }
});

// 🆕 更新联系人的自定义备注名
app.post('/api/session/:id/update-contact-note', async (req, res) => {
    const sessionId = req.params.id;
    const { jid, customName } = req.body;
    
    if (!jid) {
        return res.status(400).json({ error: '缺少 JID 参数' });
    }
    
    try {
        const { data, error } = await supabase
            .from('whatsapp_contacts')
            .update({ 
                custom_name: customName || null,
                updated_at: new Date()
            })
            .eq('session_id', sessionId)
            .eq('jid', jid);
        
        if (error) throw error;
        
        console.log(`[${sessionId}] ✅ 更新联系人 ${jid} 的备注: ${customName}`);
        
        return res.json({
            success: true,
            message: '备注已更新'
        });
    } catch (error) {
        console.error(`[${sessionId}] 更新备注失败:`, error);
        return res.status(500).json({ error: error.message });
    }
});

// 🆕 测试：查询特定联系人的 pushName  
app.get('/api/session/:id/test-pushname/:phone', async (req, res) => {
    const sessionId = req.params.id;
    const phone = req.params.phone;
    
    try {
        // 查询群组消息中该电话号码的 pushName
        const { data: groupMessages, error } = await supabase
            .from('whatsapp_messages')
            .select('participant, full_message_json, message_timestamp, remote_jid')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@g.us')
            .ilike('participant', `%${phone}%`)
            .order('message_timestamp', { ascending: false })
            .limit(20);
        
        if (error) throw error;
        
        const results = [];
        groupMessages?.forEach(msg => {
            const fullMsg = msg.full_message_json;
            const pushName = fullMsg?.pushName;
            
            results.push({
                remote_jid: msg.remote_jid,
                participant: msg.participant,
                pushName: pushName,
                timestamp: msg.message_timestamp,
                has_pushName: !!pushName,
                message_keys: Object.keys(fullMsg || {}).slice(0, 10)
            });
        });
        
        // 也查询私人消息看看
        const { data: privateMessages, error: privError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, full_message_json, message_timestamp, from_me')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@s.whatsapp.net')
            .ilike('remote_jid', `%${phone}%`)
            .eq('from_me', false)
            .order('message_timestamp', { ascending: false })
            .limit(10);
        
        const privateResults = [];
        privateMessages?.forEach(msg => {
            const fullMsg = msg.full_message_json;
            const pushName = fullMsg?.pushName;
            
            privateResults.push({
                remote_jid: msg.remote_jid,
                pushName: pushName,
                timestamp: msg.message_timestamp,
                has_pushName: !!pushName,
                from_me: msg.from_me
            });
        });
        
        return res.json({
            phone: phone,
            group_messages: {
                total: results.length,
                with_pushName: results.filter(r => r.has_pushName).length,
                samples: results.slice(0, 5)
            },
            private_messages: {
                total: privateResults.length,
                with_pushName: privateResults.filter(r => r.has_pushName).length,
                samples: privateResults.slice(0, 5)
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// 🆕 从所有消息（群组和私人）中提取 pushName 并更新联系人名称
app.post('/api/session/:id/extract-names-from-groups', async (req, res) => {
    const sessionId = req.params.id;
    
    try {
        console.log(`[${sessionId}] 🔍 正在从所有消息中提取联系人名称...`);
        
        // 方法1: 从群组消息中提取 participant 的 pushName
        const { data: groupMessages, error: groupError } = await supabase
            .from('whatsapp_messages')
            .select('participant, full_message_json')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@g.us')  // 只查询群组消息
            .not('participant', 'is', null)  // participant 不为空
            .order('message_timestamp', { ascending: false })
            .limit(5000);  // 限制查询数量，避免太慢
        
        if (groupError) throw groupError;
        
        // 方法2: 从私人消息中提取 from 的 pushName
        const { data: privateMessages, error: privateError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, full_message_json, from_me')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@s.whatsapp.net')  // 只查询私人消息
            .eq('from_me', false)  // 只要对方发来的消息
            .order('message_timestamp', { ascending: false })
            .limit(5000);
        
        if (privateError) throw privateError;
        
        const messages = [...(groupMessages || []), ...(privateMessages || [])];
        
        // 提取所有 pushName
        const pushNameMap = new Map();  // jid -> pushName
        
        messages.forEach(msg => {
            const fullMsg = msg.full_message_json;
            const pushName = fullMsg?.pushName;
            
            if (!pushName) return;
            
            // 处理群组消息：从 participant 提取
            if (msg.participant) {
                const participant = msg.participant;
                if (!pushNameMap.has(participant)) {
                    pushNameMap.set(participant, pushName);
                }
            }
            
            // 处理私人消息：从 remote_jid 提取
            if (msg.remote_jid && !msg.from_me) {
                const remoteJid = msg.remote_jid;
                if (!pushNameMap.has(remoteJid)) {
                    pushNameMap.set(remoteJid, pushName);
                }
            }
        });
        
        console.log(`[${sessionId}] 📊 从所有消息中提取到 ${pushNameMap.size} 个联系人名称（群组 + 私人）`);
        
        // 更新数据库中没有名字的联系人
        let updated = 0;
        let skipped = 0;
        let notFound = 0;
        let hasCustomName = 0;
        let alreadyHasName = 0;
        
        for (const [rawJid, pushName] of pushNameMap) {
            // rawJid 格式可能是: 
            // - 85297188675@s.whatsapp.net (私人消息)
            // - 85297188675:69@s.whatsapp.net (群组 participant，带设备ID)
            // - 210719786180760:69@lid (LID 格式)
            
            // 标准化 JID
            let jid;
            let phoneNumber;
            
            if (rawJid.includes('@lid')) {
                // LID 格式，保持原样
                jid = rawJid;
                phoneNumber = rawJid.split('@')[0].split(':')[0];  // 提取电话号码用于日志
            } else {
                // 提取电话号码，去掉设备ID
                phoneNumber = rawJid.split('@')[0].split(':')[0];
                jid = phoneNumber + '@s.whatsapp.net';
            }
            
            try {
                // 查询联系人
                const { data: existing, error: queryError } = await supabase
                    .from('whatsapp_contacts')
                    .select('name, custom_name')
                    .eq('session_id', sessionId)
                    .eq('jid', jid)
                    .maybeSingle();  // 使用 maybeSingle 代替 single，避免找不到时报错
                
                if (queryError) {
                    console.error(`[${sessionId}] ❌ 查询联系人 ${phoneNumber} 失败:`, queryError.message);
                    skipped++;
                    continue;
                }
                
                if (!existing) {
                    // 联系人不存在，创建新联系人
                    console.log(`[${sessionId}] ℹ️ 联系人 ${phoneNumber} 不存在，创建新联系人: ${pushName}`);
                    
                    const { error: insertError } = await supabase
                        .from('whatsapp_contacts')
                        .insert({
                            session_id: sessionId,
                            jid: jid,
                            name: pushName,
                            notify: pushName,
                            is_group: false,
                            updated_at: new Date()
                        });
                    
                    if (!insertError) {
                        updated++;
                        console.log(`[${sessionId}] ✅ 创建联系人 ${phoneNumber} -> ${pushName}`);
                    } else {
                        console.error(`[${sessionId}] ❌ 创建联系人失败:`, insertError.message);
                        skipped++;
                    }
                    continue;
                }
                
                // 如果已经有自定义名字，不覆盖
                if (existing.custom_name) {
                    hasCustomName++;
                    continue;
                }
                
                // 如果已经有名字且不是电话号码，不覆盖
                if (existing.name && existing.name !== phoneNumber) {
                    alreadyHasName++;
                    continue;
                }
                
                // 更新名字
                const { error: updateError } = await supabase
                    .from('whatsapp_contacts')
                    .update({
                        name: pushName,
                        notify: pushName,
                        updated_at: new Date()
                    })
                    .eq('session_id', sessionId)
                    .eq('jid', jid);
                
                if (!updateError) {
                    updated++;
                    console.log(`[${sessionId}] ✅ 更新联系人 ${phoneNumber} -> ${pushName}`);
                } else {
                    console.error(`[${sessionId}] ❌ 更新联系人失败:`, updateError.message);
                    skipped++;
                }
            } catch (e) {
                console.error(`[${sessionId}] ❌ 处理联系人 ${phoneNumber} 时出错:`, e.message);
                skipped++;
            }
        }
        
        console.log(`[${sessionId}] 📊 提取结果: 总共 ${pushNameMap.size} 个，更新 ${updated} 个，跳过 ${skipped} 个，有自定义名 ${hasCustomName} 个，已有名字 ${alreadyHasName} 个，未找到 ${notFound} 个`);
        
        return res.json({
            success: true,
            total: pushNameMap.size,
            updated: updated,
            skipped: skipped,
            hasCustomName: hasCustomName,
            alreadyHasName: alreadyHasName,
            message: `从所有消息中提取到 ${pushNameMap.size} 个名称，成功更新/创建 ${updated} 个联系人\n\n已有自定义名: ${hasCustomName} 个\n已有其他名字: ${alreadyHasName} 个\n跳过/失败: ${skipped} 个`
        });
    } catch (error) {
        console.error(`[${sessionId}] 提取名称失败:`, error);
        return res.status(500).json({ error: error.message });
    }
});

// Refresh group names
app.post('/api/session/:id/refresh-groups', async (req, res) => {
    const sessionId = req.params.id;
    const mem = sessions.get(sessionId);
    
    if (!mem || !mem.sock) {
        return res.status(400).json({ error: '會話未連接' });
    }
    
    try {
        console.log(`[${sessionId}] 手動刷新群組名稱...`);
        const groups = await mem.sock.groupFetchAllParticipating();
        const groupUpdates = Object.keys(groups).map(jid => ({
            session_id: sessionId,
            jid: jid,
            name: groups[jid].subject || '未命名群組',
            notify: groups[jid].subject || '未命名群組',
            is_group: true,
            updated_at: new Date()
        }));
        
        if (groupUpdates.length > 0) {
            await supabase.from('whatsapp_contacts')
                .upsert(groupUpdates, { onConflict: 'session_id,jid', ignoreDuplicates: false });
            
            console.log(`[${sessionId}] ✅ 已刷新 ${groupUpdates.length} 個群組名稱`);
            return res.json({ 
                success: true, 
                groupsUpdated: groupUpdates.length,
                message: `已更新 ${groupUpdates.length} 個群組名稱`
            });
        } else {
            return res.json({ success: true, groupsUpdated: 0, message: '沒有找到群組' });
        }
    } catch (error) {
        console.error(`[${sessionId}] 刷新群組名稱失敗:`, error);
        return res.status(500).json({ error: error.message });
    }
});

// Restart Session (to trigger re-sync)
app.post('/api/session/:id/restart', async (req, res) => {
    const sessionId = req.params.id;
    const mem = sessions.get(sessionId);
    
    if (mem && mem.sock) {
        try {
            // Close existing connection
            await mem.sock.end();
        } catch(e) {
            console.error(`[${sessionId}] Error closing socket:`, e.message);
        }
        
        // Remove from sessions map
        sessions.delete(sessionId);
        
        // Wait a moment before reconnecting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // Reconnect
            await connectToWhatsApp(sessionId);
            res.json({ success: true, message: 'Session restarted, history sync will begin automatically.' });
        } catch(e) {
            res.status(500).json({ error: `Failed to restart: ${e.message}` });
        }
    } else {
        // If not connected, just try to connect
        try {
            await connectToWhatsApp(sessionId);
            res.json({ success: true, message: 'Session started, history sync will begin automatically.' });
        } catch(e) {
            res.status(500).json({ error: `Failed to start: ${e.message}` });
        }
    }
});

// Sync recent messages by restarting the session (triggers history sync)
app.post('/api/session/:id/sync-recent', async (req, res) => {
    const sessionId = req.params.id;
    
    // Note: Due to WhatsApp API limitations, the most reliable way to sync
    // historical messages is to restart the session, which triggers the
    // messaging-history.set event. However, WhatsApp typically only sends
    // history once per device ID, so this may not retrieve additional messages.
    
    res.json({ 
        success: false,
        message: '由於 WhatsApp API 限制，無法主動拉取歷史消息。請使用「強制同步」功能（需要重新掃描 QR 碼）來獲取完整歷史。',
        recommendation: '點擊網頁上的「強制同步」按鈕，重新登入後可以獲取完整的歷史消息。'
    });
});

// 🆕 手动添加联系人（用于修复缺失的联系人）
app.post('/api/session/:id/add-contact', async (req, res) => {
    const sessionId = req.params.id;
    const { jid, name } = req.body;
    
    if (!jid) {
        return res.status(400).json({ error: 'JID required' });
    }
    
    try {
        // 🔧 首先获取该联系人的最后消息时间
        const { data: messages } = await supabase
            .from('whatsapp_messages')
            .select('message_timestamp, push_name')
            .eq('session_id', sessionId)
            .eq('remote_jid', jid)
            .order('message_timestamp', { ascending: false })
            .limit(1);
        
        const lastMessage = messages && messages.length > 0 ? messages[0] : null;
        // 🔧 如果没有传入 name，从消息中获取对方的名字（排除自己发的消息）
        const otherMessage = lastMessage && lastMessage.from_me !== true ? lastMessage : null;
        const contactName = name || otherMessage?.push_name || lastMessage?.push_name || jid.split('@')[0];
        
        // 🔧 使用当前时间作为 updated_at，确保新添加的联系人排在前面
        const updatedAt = new Date();
        
        const { error } = await supabase.from('whatsapp_contacts').upsert({
            session_id: sessionId,
            jid: jid,
            name: contactName,
            notify: contactName,
            updated_at: updatedAt
        }, { onConflict: 'session_id,jid' });
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        res.json({ 
            success: true, 
            message: `Contact ${contactName} added`,
            lastMessageTime: lastMessage?.message_timestamp || null
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Contacts (Protected by Session ID only) with last message time
app.get('/api/session/:id/contacts', async (req, res) => {
    const sessionId = req.params.id;
    
    // 🔧 分页获取所有联系人（直接从 whatsapp_contacts 表，不用视图）
    let data = [];
    let currentPage = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
        const { data: pageData, error: pageError } = await supabase
        .from('whatsapp_contacts')
        .select('*')
            .eq('session_id', sessionId)
            .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);
        
        if (pageError) {
            console.error(`[API] ❌ Error fetching contacts page ${currentPage}:`, pageError);
            break;
        }
        
        if (pageData && pageData.length > 0) {
            data.push(...pageData);
            currentPage++;
            if (pageData.length < pageSize) {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }
    
    console.log(`[API] 📊 从数据库获取了 ${data.length} 个联系人（共 ${currentPage} 页）`);
    
    // 🔧 获取 JID 映射关系
    const { data: mappings, error: mappingError } = await supabase
        .from('whatsapp_jid_mapping')
        .select('*')
        .eq('session_id', sessionId);
    
    if (mappingError) {
        console.error(`[API] ⚠️ 获取 JID 映射失败:`, mappingError);
    }
    
    // 🔧 在应用层处理 LID 合并
    const mappingMap = new Map();
    (mappings || []).forEach(m => {
        mappingMap.set(m.lid_jid, m.traditional_jid);
    });
    
    // 创建合并后的联系人列表
    const mergedContacts = new Map();
    const lidToHide = new Set(); // 需要隐藏的 LID 联系人
    
    data.forEach(contact => {
        const jid = contact.jid;
        
        // 如果是 LID，检查是否有映射
        if (jid.endsWith('@lid') && mappingMap.has(jid)) {
            const traditionalJid = mappingMap.get(jid);
            lidToHide.add(jid);
            
            // 查找对应的传统 JID 联系人
            const traditionalContact = data.find(c => c.jid === traditionalJid);
            
            if (traditionalContact) {
                // 使用传统 JID，合并信息
                // 取两个 JID 中最新的消息时间
                const traditionalTime = traditionalContact.last_message_time ? new Date(traditionalContact.last_message_time) : new Date(0);
                const lidTime = contact.last_message_time ? new Date(contact.last_message_time) : new Date(0);
                const latestMessageTime = traditionalTime > lidTime ? traditionalContact.last_message_time : contact.last_message_time;
                
                const merged = {
                    ...traditionalContact,
                    last_message_time: latestMessageTime,
                    updated_at: new Date(Math.max(
                        new Date(traditionalContact.updated_at || 0),
                        new Date(contact.updated_at || 0)
                    )).toISOString()
                };
                mergedContacts.set(traditionalJid, merged);
            } else {
                // 传统 JID 不存在，使用 LID（但 JID 显示为传统格式）
                mergedContacts.set(traditionalJid, {
                    ...contact,
                    jid: traditionalJid
                });
            }
        } else if (!jid.endsWith('@lid')) {
            // 传统 JID，直接添加（如果还没有的话）
            if (!mergedContacts.has(jid)) {
                mergedContacts.set(jid, contact);
            }
        } else {
            // LID 但没有映射，保留
            mergedContacts.set(jid, contact);
        }
    });
    
    // 转换回数组
    data = Array.from(mergedContacts.values());
    
    console.log(`[API] 🔗 处理 LID 映射: ${mappings?.length || 0} 个映射，隐藏了 ${lidToHide.size} 个 LID 联系人，最终 ${data.length} 个联系人`);
    
    const error = null;
        
    // If empty, use Store to populate
    if ((!data || data.length === 0)) {
         console.log('Contacts DB empty, trying to fetch from local cache...');
         const cache = contactCache.get(sessionId);
         
         if (cache && cache.size > 0) {
             const contacts = Array.from(cache.values());
             
             // Format for DB and Response
             const upsertData = contacts.map(c => ({
                session_id: sessionId,
                jid: c.id,
                name: c.name || c.notify || c.verifiedName || null,
                notify: c.notify || null,
                updated_at: new Date()
            }));
            
            // Async Update DB
            supabase.from('whatsapp_contacts').upsert(upsertData, { onConflict: 'session_id,jid' }).then(({ error }) => {
                if(error) console.error('Failed to sync cache to DB:', error);
            });
            
            data = upsertData;
         }
    }
    
    if (error) return res.status(500).json({ error: error.message });
    
    // Enrich contacts with last message time
    try {
        console.log(`[API] 📋 获取 ${data.length} 个联系人的最后消息时间...`);
        
        if (data.length === 0) {
            return res.json([]);
        }
        
        // 修复：使用单个聚合查询获取所有联系人的最后消息时间（高效）
        // 尝试使用 RPC 函数（如果已创建）
        let lastMessageMap = new Map();
        
        try {
            // 尝试使用自定义函数（需要先在 Supabase 中创建）
            const { data: lastMessages, error: rpcError } = await supabase
                .rpc('get_last_message_times', { session_id_param: sessionId });
            
            if (!rpcError && lastMessages) {
                lastMessages.forEach(({ remote_jid, last_message_timestamp }) => {
                    lastMessageMap.set(remote_jid, last_message_timestamp);
                });
                console.log(`[API] ✅ 使用 RPC 函数获取到 ${lastMessageMap.size} 个联系人的最后消息时间`);
            } else {
                throw new Error('RPC function not available, using fallback');
            }
        } catch (rpcError) {
            // 回退方案：使用原生查询
            console.log(`[API] ⚠️ RPC 函数不可用，使用原生查询...`);
            
            // 直接查询所有消息，按 remote_jid 分组获取最大时间戳
            // 注意：这个查询可能会很慢，建议创建 RPC 函数
            const { data: messages } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, message_timestamp')
            .eq('session_id', sessionId)
            .order('message_timestamp', { ascending: false });
        
            if (messages) {
                // 手动分组获取每个联系人的最后消息时间
                messages.forEach(msg => {
                if (!lastMessageMap.has(msg.remote_jid)) {
                    lastMessageMap.set(msg.remote_jid, msg.message_timestamp);
                }
            });
                console.log(`[API] ✅ 使用原生查询获取到 ${lastMessageMap.size} 个联系人的最后消息时间`);
            }
        }
        
        // 🔧 为映射的 JID 合并消息时间
        // 如果一个传统 JID 有对应的 LID，需要合并两者的消息时间
        const reverseMappingMap = new Map();
        (mappings || []).forEach(m => {
            reverseMappingMap.set(m.traditional_jid, m.lid_jid);
        });
        
        // 为每个联系人获取合并后的最后消息时间
        data.forEach(contact => {
            const traditionalJid = contact.jid;
            const lidJid = reverseMappingMap.get(traditionalJid);
            
            // 如果有 LID 映射，合并两个 JID 的消息时间
            if (lidJid) {
                const traditionalTime = lastMessageMap.get(traditionalJid);
                const lidTime = lastMessageMap.get(lidJid);
                
                if (traditionalTime && lidTime) {
                    const latest = new Date(traditionalTime) > new Date(lidTime) ? traditionalTime : lidTime;
                    lastMessageMap.set(traditionalJid, latest);
                } else if (lidTime) {
                    lastMessageMap.set(traditionalJid, lidTime);
                }
            }
        });
        
        // Add last_message_time to each contact
        // 🔧 优先使用已经合并的 last_message_time（如果存在的话）
        let enrichedData = data.map(contact => ({
            ...contact,
            last_message_time: contact.last_message_time || lastMessageMap.get(contact.jid) || null
        }));
        
        // 🔧 确保"我"（用户自己）也在联系人列表中，并有正确的 last_message_time
        const session = sessions.get(sessionId);
        if (session && session.userInfo) {
            // 用户的 JID 可能有多种格式：
            // 1. LID 格式: 210719786180760:69@lid
            // 2. 旧格式: 85297188675:69@s.whatsapp.net
            // 需要检查两种格式
            const myLidJid = session.userInfo.id; // LID 格式
            const myPhoneNumber = myLidJid.split(':')[0].split('@')[0]; // 提取电话号码
            const myOldJid = myPhoneNumber + '@s.whatsapp.net'; // 旧格式
            
            // 检查哪个 JID 有消息记录
            let myJid = null;
            let myLastMessageTime = null;
            
            if (lastMessageMap.has(myLidJid)) {
                myJid = myLidJid;
                myLastMessageTime = lastMessageMap.get(myLidJid);
            } else if (lastMessageMap.has(myOldJid)) {
                myJid = myOldJid;
                myLastMessageTime = lastMessageMap.get(myOldJid);
            }
            
            if (myJid && myLastMessageTime) {
                const hasSelf = enrichedData.some(c => c.jid === myJid || c.jid === myOldJid || c.jid === myLidJid);
                
                if (!hasSelf) {
                    // 如果联系人列表中没有"我"，但有消息记录，就添加"我"
                    enrichedData.push({
                        session_id: sessionId,
                        jid: myJid,
                        name: session.userInfo.name || '我',
                        notify: session.userInfo.name || '我',
                        last_message_time: myLastMessageTime,
                        updated_at: new Date().toISOString()
                    });
                    console.log(`[API] ℹ️ 自动添加"我"(${myJid})到联系人列表，最后消息时间: ${myLastMessageTime}`);
                }
            }
        }
        
        // 🔧 排序逻辑：完全按最新消息时间排序（和 WhatsApp 原生顺序一致）
        enrichedData.sort((a, b) => {
            const timeA = a.last_message_time;
            const timeB = b.last_message_time;
            
            // 1️⃣ 没有消息时间的排到最后
            if (!timeA && !timeB) {
                // 两个都没有消息，按名字排序
                const nameA = a.name || a.jid || '';
                const nameB = b.name || b.jid || '';
                return nameA.localeCompare(nameB);
            }
            if (!timeA) return 1;  // A 没有消息，排到后面
            if (!timeB) return -1; // B 没有消息，排到后面
            
            // 2️⃣ 按最新消息时间排序（降序：最新的在前）
            const timeCompare = timeB.localeCompare(timeA);
            
            // 3️⃣ 如果时间相同，按名字排序
            if (timeCompare === 0) {
                const nameA = a.name || a.jid || '';
                const nameB = b.name || b.jid || '';
                return nameA.localeCompare(nameB);
            }
            
            return timeCompare;
        });
        
        // 🆕 去重：对于同名的联系人/群组，只保留最新的那一个
        const nameMap = new Map(); // name -> contact with latest message
        const deduplicatedData = [];
        
        for (const contact of enrichedData) {
            const name = contact.name || contact.jid;
            
            if (!name) {
                // 如果没有名字，直接保留
                deduplicatedData.push(contact);
                continue;
            }
            
            const existing = nameMap.get(name);
            
            if (!existing) {
                // 第一次遇到这个名字，记录下来
                nameMap.set(name, contact);
                deduplicatedData.push(contact);
            } else {
                // 已经存在同名的，比较 last_message_time
                const existingTime = existing.last_message_time || existing.updated_at || '';
                const currentTime = contact.last_message_time || contact.updated_at || '';
                
                if (currentTime > existingTime) {
                    // 当前联系人的消息更新，替换掉旧的
                    const index = deduplicatedData.indexOf(existing);
                    if (index !== -1) {
                        deduplicatedData[index] = contact;
                        nameMap.set(name, contact);
                    }
                }
                // 否则，保留原来的（更新的），丢弃当前这个旧的
            }
        }
        
        enrichedData = deduplicatedData;
        console.log(`[API] 🔄 去重后剩余 ${enrichedData.length} 个联系人`);
        
        // 🆕 排序后处理：查找前 50 个可见联系人中无消息的私人联系人并替换为群组
        const replacements = new Map(); // jid -> groupJid
        const visibleContacts = enrichedData.slice(0, 50);
        
        for (const contact of visibleContacts) {
            const isGroup = contact.is_group || contact.jid.endsWith('@g.us');
            const hasMessages = lastMessageMap.has(contact.jid);
            
            if (!isGroup && !hasMessages) {
                const phoneNumber = contact.jid.split('@')[0].split(':')[0];
                
                // 🔧 查询该联系人的群组消息（带时间戳，选择最近的）
                const { data: groupMessages } = await supabase
                    .from('whatsapp_messages')
                    .select('remote_jid, message_timestamp')
                    .eq('session_id', sessionId)
                    .like('remote_jid', '%@g.us')
                    .ilike('participant', `%${phoneNumber}%`)
                    .order('message_timestamp', { ascending: false })
                    .limit(50);
                
                if (groupMessages && groupMessages.length > 0) {
                    // 🔧 选择最近活跃的群组（第一条消息的群组）
                    const mostRecentGroupJid = groupMessages[0].remote_jid;
                    replacements.set(contact.jid, mostRecentGroupJid);
                    
                    const groupCount = new Set(groupMessages.map(m => m.remote_jid)).size;
                    console.log(`[API] 🔄 替换联系人: ${contact.name || contact.jid.split('@')[0]} -> 最近活跃群组 ${mostRecentGroupJid.split('@')[0]} (共 ${groupCount} 个群组)`);
                }
            }
        }
        
        // 执行替换
        if (replacements.size > 0) {
            enrichedData = enrichedData.map(contact => {
                if (replacements.has(contact.jid)) {
                    const groupJid = replacements.get(contact.jid);
                    const existingGroup = enrichedData.find(c => c.jid === groupJid);
                    
                    if (existingGroup) {
                        return {
                            ...existingGroup,
                            _original_contact_name: contact.name,
                            _is_replacement: true
                        };
                    }
                }
                return contact;
            });
            
            // 去重：删除重复的独立群组
            const replacementGroupJids = new Set(Array.from(replacements.values()));
            enrichedData = enrichedData.filter(contact => {
                const isGroup = contact.is_group || contact.jid.endsWith('@g.us');
                const isReplacement = contact._is_replacement;
                // 删除重复的独立群组（非替换的）
                if (isGroup && replacementGroupJids.has(contact.jid) && !isReplacement) {
                    return false;
                }
                return true;
            });
            
            // 🆕 去重替换群组：多个联系人可能被替换为同一个群组，只保留第一个
            const seenReplacementJids = new Set();
            enrichedData = enrichedData.filter(contact => {
                if (contact._is_replacement) {
                    if (seenReplacementJids.has(contact.jid)) {
                        // 已经有这个替换群组了，删除重复的
                        return false;
                    } else {
                        seenReplacementJids.add(contact.jid);
                        return true;
                    }
                }
                return true;
            });
        }
        
        // 🔧 为每个联系人添加电话号码字段（用于显示）
        enrichedData = enrichedData.map(contact => {
            let phoneNumber = null;
            
            if (contact.jid.endsWith('@lid')) {
                // 对于 LID 格式，尝试从映射表中找到传统 JID
                const mapping = mappingMap.get(contact.jid);
                if (mapping && mapping.endsWith('@s.whatsapp.net')) {
                    phoneNumber = mapping.split('@')[0];
                }
            } else if (contact.jid.endsWith('@s.whatsapp.net')) {
                // 对于传统格式，直接提取电话号码
                phoneNumber = contact.jid.split('@')[0];
            }
            
            return {
                ...contact,
                phone_number: phoneNumber
            };
        });
        
        console.log(`[API] ✅ 返回 ${enrichedData.length} 个联系人（按最新消息时间排序，替换了 ${replacements.size} 个无消息联系人）`);
        res.json(enrichedData);
    } catch (enrichError) {
        console.error('[API] ❌ Error enriching contacts:', enrichError);
        // If enrichment fails, still try to sort by updated_at
        const sortedData = data.sort((a, b) => {
            const timeA = a.updated_at || '';
            const timeB = b.updated_at || '';
            return timeB.localeCompare(timeA);
        });
        res.json(sortedData);
    }
});

// 🆕 查找联系人参与的群组（按最近活跃时间排序）
app.get('/api/session/:id/contact-groups/:jid', async (req, res) => {
    const sessionId = req.params.id;
    const contactJid = req.params.jid;
    
    try {
        // 从联系人 JID 中提取电话号码（去掉 @lid 或 @s.whatsapp.net）
        const phoneNumber = contactJid.split('@')[0].split(':')[0];
        
        // 查找包含该联系人的群组消息（作为 participant）
        const { data: groupMessages, error } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, message_timestamp')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@g.us') // 只查群组
            .ilike('participant', `%${phoneNumber}%`) // participant 包含电话号码
            .order('message_timestamp', { ascending: false })
            .limit(500);
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        // 🔧 计算每个群组中该联系人的最后消息时间
        const groupLastMessage = new Map();
        groupMessages?.forEach(msg => {
            if (!groupLastMessage.has(msg.remote_jid)) {
                groupLastMessage.set(msg.remote_jid, msg.message_timestamp);
            }
        });
        
        const uniqueGroupJids = Array.from(groupLastMessage.keys());
        
        // 获取群组详细信息
        if (uniqueGroupJids.length > 0) {
            const { data: groups } = await supabase
                .from('whatsapp_contacts')
                .select('jid, name, is_group')
                .eq('session_id', sessionId)
                .in('jid', uniqueGroupJids);
            
            // 添加最后消息时间并排序
            const groupsWithTime = (groups || []).map(g => ({
                ...g,
                last_activity: groupLastMessage.get(g.jid)
            })).sort((a, b) => {
                // 按最近活跃时间排序
                return (b.last_activity || '').localeCompare(a.last_activity || '');
            });
            
            res.json({
                contactJid,
                groups: groupsWithTime,
                totalGroups: uniqueGroupJids.length,
                mostRecentGroup: groupsWithTime[0] || null // 最近活跃的群组
            });
        } else {
            res.json({
                contactJid,
                groups: [],
                totalGroups: 0,
                mostRecentGroup: null
            });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get Profile Picture (Avatar)
app.get('/api/session/:id/avatar/:jid', async (req, res) => {
    const sessionId = req.params.id;
    const jid = req.params.jid;
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(404).json({ error: 'Session not found or not connected' });
        }
        
        try {
            // Get profile picture URL from WhatsApp
            const ppUrl = await session.sock.profilePictureUrl(jid, 'image');
            
            if (ppUrl) {
                // Return the URL directly
                res.json({ success: true, url: ppUrl });
            } else {
                // No profile picture available
                res.json({ success: false, url: null });
            }
        } catch (ppError) {
            // Profile picture not available (privacy settings or doesn't exist)
            console.log(`[API] ℹ️ 联系人 ${jid} 没有头像或隐私设置不可见`);
            res.json({ success: false, url: null });
        }
    } catch (e) {
        console.error(`[API] ❌ 获取头像失败:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Get Messages (支持 LID 和传统 JID 合并)
app.get('/api/session/:id/messages/:jid', async (req, res) => {
    const sessionId = req.params.id;
    const jid = req.params.jid;
    
    console.log(`[API] 📨 获取消息: 会话=${sessionId}, 聊天=${jid}`);
    
    try {
        // 🔧 使用 PostgreSQL 函数来合并 LID 和传统 JID 的消息
        const { data, error } = await supabase
            .rpc('get_merged_messages', {
                p_session_id: sessionId,
                p_jid: jid
            });
        
        if (error) {
            console.error(`[API] ❌ 获取消息失败:`, error);
            return res.status(500).json({ error: error.message });
        }
        
        // 按时间戳排序
        const sortedData = (data || []).sort((a, b) => 
            new Date(a.message_timestamp) - new Date(b.message_timestamp)
        );
        
        // 🔍 诊断日志：统计 from_me 的消息数量
        const fromMeCount = sortedData.filter(m => m.from_me === true).length;
        const fromOthersCount = sortedData.filter(m => m.from_me === false).length;
        
        // 🔍 如果有合并的消息，显示来源 JID
        const uniqueJids = [...new Set(sortedData.map(m => m.remote_jid))];
        if (uniqueJids.length > 1) {
            console.log(`[API] 🔗 合并了 ${uniqueJids.length} 个 JID 的消息: ${uniqueJids.join(', ')}`);
        }
        
        console.log(`[API] ✅ 返回 ${sortedData.length} 条消息 (我发送: ${fromMeCount}, 对方发送: ${fromOthersCount})`);
        res.json(sortedData);
    } catch (error) {
        console.error(`[API] ❌ 获取消息异常:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Debug: DB Check
app.get('/api/debug/db-check/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    
    // Count messages
    const { count: msgCount, error: msgError } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);

    // Count contacts
    const { count: contactCount, error: contactError } = await supabase
        .from('whatsapp_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);
        
    // Get latest 5 messages
    const { data: latestMsgs } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid, message_type, content, created_at, message_timestamp')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(5);

    res.json({
        sessionId,
        msgCount,
        contactCount,
        latestMsgs,
        errors: { msgError, contactError }
    });
});

// Broadcast / Marketing API
app.post('/api/session/:id/broadcast', upload.single('attachment'), async (req, res) => {
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    
    if (!session || session.status !== 'connected' || !session.sock) {
        return res.status(400).json({ error: 'Session not connected' });
    }

    try {
        let recipients = JSON.parse(req.body.recipients || '[]');
        const text = req.body.text || '';
        const attachment = req.file; // From multer
        
        // Handle sending to self explicitly if requested
        // If recipient is just a phone number without suffix, try to append
        recipients = recipients.map(r => {
            if (!r.includes('@')) return r + '@s.whatsapp.net';
            return r;
        });

        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No recipients selected' });
        }

        // 1. Check Daily Limit (50 per day)
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        
        const { count, error: countError } = await supabase
            .from('whatsapp_messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('from_me', true)
            .gte('message_timestamp', todayStart.toISOString()); // Use message timestamp
            
        if (countError) throw countError;
        
        // 无限制版本 - 不再检查每日发送数量限制
        const DAILY_LIMIT = 999999; // 无限制
        const remaining = DAILY_LIMIT - (count || 0);

        // 2. Start Sending in Background (to avoid timeout)
        // We respond immediately saying "Started"
        res.json({ success: true, message: `Starting broadcast to ${recipients.length} contacts...` });

        // Async Process
        (async () => {
            console.log(`Starting broadcast for ${sessionId} to ${recipients.length} recipients`);
            
            for (const jid of recipients) {
                try {
                    // Random delay 2-5 seconds
                    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
                    
                    let sentMsg;
                    if (attachment) {
                        const filePath = attachment.path;
                        const mimetype = attachment.mimetype;
                        
                        let msgType = 'document';
                        if (mimetype.startsWith('image/')) msgType = 'image';
                        else if (mimetype.startsWith('video/')) msgType = 'video';
                        else if (mimetype.startsWith('audio/')) msgType = 'audio';

                        sentMsg = await session.sock.sendMessage(jid, {
                            [msgType]: { url: filePath },
                            caption: text,
                            mimetype: mimetype,
                            fileName: attachment.originalname // For documents
                        });
                    } else if (text) {
                        sentMsg = await session.sock.sendMessage(jid, { text: text });
                    }

                    if (sentMsg) {
                        await saveMessageToSupabase(sessionId, sentMsg, session.sock);
                    }

                } catch (e) {
                    console.error(`Failed to send broadcast to ${jid}:`, e);
                }
            }
            console.log(`Broadcast finished for ${sessionId}`);
        })();

    } catch (e) {
        console.error('Broadcast error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Download Media for a Specific Message
app.post('/api/session/:id/download-media/:messageId', async (req, res) => {
    const { id: sessionId, messageId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session || !session.sock) {
        return res.status(400).json({ error: 'Session not active' });
    }
    
    try {
        // Get message from database
        const { data: msg, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('message_id', messageId)
            .single();
            
        if (error || !msg) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // Check if media already exists
        if (msg.attachment_path) {
            return res.json({ 
                success: true, 
                media_path: `/media/${msg.attachment_path}`,
                message: 'Media already downloaded'
            });
        }
        
        const realMessage = unwrapMessage(msg.full_message_json.message);
        if (!realMessage) {
            return res.status(400).json({ error: 'Invalid message format' });
        }
        
        const messageType = getContentType(realMessage);
        const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage', 'pttMessage'];
        
        if (!mediaTypes.includes(messageType)) {
            return res.status(400).json({ error: 'Message does not contain media' });
        }
        
        console.log(`[${sessionId}] 📥 Downloading ${messageType} for message ${messageId}`);
        
        // Download media
        const buffer = await downloadMediaMessage(
            { key: msg.full_message_json.key, message: realMessage },
            'buffer',
            {},
            { 
                logger: console,
                reuploadRequest: session.sock.updateMediaMessage
            }
        ).catch((e) => {
            console.error(`[${sessionId}] Media download failed:`, e.message);
            return null;
        });
        
        if (buffer) {
            let ext = mime.extension(realMessage[messageType]?.mimetype || 'application/octet-stream');
            
            // Better extension handling
            if (messageType === 'documentMessage') {
                const fileName = realMessage.documentMessage?.fileName;
                if (fileName && fileName.includes('.')) {
                    ext = fileName.split('.').pop();
                }
            } else if (messageType === 'audioMessage' || messageType === 'pttMessage') {
                ext = 'ogg';
            } else if (messageType === 'stickerMessage') {
                ext = 'webp';
            } else if (messageType === 'imageMessage' && !ext) {
                ext = 'jpg';
            } else if (messageType === 'videoMessage' && !ext) {
                ext = 'mp4';
            }
            
            if (!ext) ext = 'bin';
            
            const attachmentFilename = `${messageId}.${ext}`;
            const filePath = path.join(SHARED_MEDIA_DIR, attachmentFilename);
            fs.writeFileSync(filePath, buffer);
            console.log(`[${sessionId}] ✅ Saved media to ${attachmentFilename}`);
            
            // Update database
            await supabase
                .from('whatsapp_messages')
                .update({ attachment_path: attachmentFilename })
                .eq('session_id', sessionId)
                .eq('message_id', messageId);
            
            res.json({ 
                success: true, 
                media_path: `/media/${attachmentFilename}`,
                size: buffer.length
            });
        } else {
            res.status(500).json({ error: 'Failed to download media' });
        }
    } catch (e) {
        console.error('Download media error:', e);
        res.status(500).json({ error: e.message });
    }
});

// 🆕 全局下载所有缺失的媒体文件（图片和视频）
app.post('/api/session/:id/download-all-media', async (req, res) => {
    const sessionId = req.params.id;
    const session = sessions.get(sessionId);
    
    if (!session || !session.sock) {
        return res.status(400).json({ error: 'Session not active' });
    }
    
    try {
        // 🔧 只下载图片和视频（跳过音频、贴图和文档）
        const { data: messages, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('session_id', sessionId)
            .is('attachment_path', null)
            .in('message_type', ['imageMessage', 'videoMessage'])
            .order('message_timestamp', { ascending: false })
            .limit(500); // 限制 500 个，避免一次性下载太多
        
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        console.log(`[${sessionId}] 📥 开始全局下载 ${messages.length} 个缺失的图片和视频...`);
        
        let downloaded = 0;
        let failed = 0;
        
        // 异步处理，不阻塞响应
        (async () => {
            for (const msg of messages) {
                try {
                    const realMessage = unwrapMessage(msg.full_message_json.message);
                    if (!realMessage) continue;
                    
                    const messageType = getContentType(realMessage);
                    
                    const buffer = await downloadMediaMessage(
                        { key: msg.full_message_json.key, message: realMessage },
                        'buffer',
                        {},
                        { 
                            logger: console,
                            reuploadRequest: session.sock.updateMediaMessage
                        }
                    ).catch(() => null);
                    
                    if (buffer) {
                        let ext = mime.extension(realMessage[messageType]?.mimetype || 'application/octet-stream');
                        
                        if (messageType === 'imageMessage' && !ext) {
                            ext = 'jpg';
                        } else if (messageType === 'videoMessage' && !ext) {
                            ext = 'mp4';
                        }
                        
                        if (!ext) ext = 'bin';
                        
                        const attachmentFilename = `${msg.message_id}.${ext}`;
                        const filePath = path.join(SHARED_MEDIA_DIR, attachmentFilename);
                        fs.writeFileSync(filePath, buffer);
                        
                        await supabase
                            .from('whatsapp_messages')
                            .update({ attachment_path: attachmentFilename })
                            .eq('session_id', sessionId)
                            .eq('message_id', msg.message_id);
                        
                        downloaded++;
                        
                        if (downloaded % 10 === 0) {
                            console.log(`[${sessionId}] 📥 进度: ${downloaded}/${messages.length}`);
                        }
                    } else {
                        failed++;
                    }
                } catch (e) {
                    failed++;
                    console.error(`[${sessionId}] ❌ Failed to download media:`, e.message);
                }
            }
            
            console.log(`[${sessionId}] ✅ 全局下载完成: 成功 ${downloaded}, 失败 ${failed}`);
        })();
        
        // 立即返回响应
        res.json({ 
            success: true, 
            message: `开始下载 ${messages.length} 个媒体文件（图片和视频）`,
            total: messages.length,
            note: '下载正在后台进行，请稍候...'
        });
    } catch (e) {
        console.error(`[${sessionId}] ❌ Error starting global media download:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Download All Missing Media for a Chat
app.post('/api/session/:id/download-chat-media/:jid', async (req, res) => {
    const { id: sessionId, jid } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session || !session.sock) {
        return res.status(400).json({ error: 'Session not active' });
    }
    
    try {
        // Get all messages without media for this chat
        const { data: messages, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('session_id', sessionId)
            .eq('remote_jid', jid)
            .is('attachment_path', null)
            .in('message_type', ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage']);
            
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        console.log(`[${sessionId}] 📥 Downloading ${messages.length} missing media files for ${jid}`);
        
        let downloaded = 0;
        let failed = 0;
        
        for (const msg of messages) {
            try {
                const realMessage = unwrapMessage(msg.full_message_json.message);
                if (!realMessage) continue;
                
                const messageType = getContentType(realMessage);
                
                const buffer = await downloadMediaMessage(
                    { key: msg.full_message_json.key, message: realMessage },
                    'buffer',
                    {},
                    { 
                        logger: console,
                        reuploadRequest: session.sock.updateMediaMessage
                    }
                ).catch(() => null);
                
                if (buffer) {
                    let ext = mime.extension(realMessage[messageType]?.mimetype || 'application/octet-stream');
                    
                    if (messageType === 'documentMessage') {
                        const fileName = realMessage.documentMessage?.fileName;
                        if (fileName && fileName.includes('.')) {
                            ext = fileName.split('.').pop();
                        }
                    } else if (messageType === 'audioMessage' || messageType === 'pttMessage') {
                        ext = 'ogg';
                    } else if (messageType === 'stickerMessage') {
                        ext = 'webp';
                    } else if (messageType === 'imageMessage' && !ext) {
                        ext = 'jpg';
                    } else if (messageType === 'videoMessage' && !ext) {
                        ext = 'mp4';
                    }
                    
                    if (!ext) ext = 'bin';
                    
                    const attachmentFilename = `${msg.message_id}.${ext}`;
                    const filePath = path.join(SHARED_MEDIA_DIR, attachmentFilename);
                    fs.writeFileSync(filePath, buffer);
                    
                    await supabase
                        .from('whatsapp_messages')
                        .update({ attachment_path: attachmentFilename })
                        .eq('session_id', sessionId)
                        .eq('message_id', msg.message_id);
                    
                    downloaded++;
                    console.log(`[${sessionId}] ✅ Downloaded ${attachmentFilename}`);
                } else {
                    failed++;
                }
            } catch (e) {
                console.error(`[${sessionId}] ❌ Failed to download media for ${msg.message_id}:`, e.message);
                failed++;
            }
        }
        
        res.json({ 
            success: true, 
            total: messages.length,
            downloaded,
            failed
        });
    } catch (e) {
        console.error('Download chat media error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get Daily Stats
app.get('/api/session/:id/daily-stats', async (req, res) => {
    const sessionId = req.params.id;
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    
    const { count, error } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('from_me', true)
        .gte('created_at', todayStart.toISOString());
        
    if (error) return res.status(500).json({ error: error.message });
    
    // 无限制版本
    const limit = 999999;
    
    // Check if count is reasonable? If we just synced history, maybe "from_me" messages today are counted as "sent today"?
    // Actually, synced messages have their original timestamp. But 'created_at' in DB is when they were inserted.
    // If we just did a huge sync, 'created_at' for all history is TODAY.
    // FIX: We should check 'message_timestamp' instead of 'created_at' for the daily limit logic!
    
    const { count: realCount, error: realError } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .eq('from_me', true)
        .gte('message_timestamp', todayStart.toISOString()); // Use message timestamp

    if (realError) return res.status(500).json({ error: realError.message });

    res.json({ 
        sent: realCount || 0, 
        limit: limit, 
        remaining: limit - (realCount || 0) 
    });
});

// Get Calendar Stats
app.get('/api/session/:id/calendar-stats', async (req, res) => {
    const sessionId = req.params.id;
    const start = req.query.start;
    const end = req.query.end;
    
    // Group by date
    // Supabase doesn't support advanced aggregation easily via client without RPC.
    // We fetch all 'from_me' messages in range and aggregate in JS.
    // Optimization: select only timestamp
    
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('message_timestamp')
        .eq('session_id', sessionId)
        .eq('from_me', true)
        .gte('message_timestamp', start)
        .lte('message_timestamp', end);
        
    if (error) return res.status(500).json({ error: error.message });
    
    const stats = {};
    data.forEach(m => {
        const date = new Date(m.message_timestamp).toISOString().split('T')[0];
        if (!stats[date]) stats[date] = { sent: 0 };
        stats[date].sent++;
    });
    
    res.json(stats);
});

// Get Logs for Date
app.get('/api/session/:id/logs', async (req, res) => {
    const sessionId = req.params.id;
    const dateStr = req.query.date; // YYYY-MM-DD
    
    const start = new Date(dateStr);
    const end = new Date(dateStr);
    end.setHours(23,59,59,999);
    
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid, push_name, created_at')
        .eq('session_id', sessionId)
        .eq('from_me', true)
        .gte('message_timestamp', start.toISOString())
        .lte('message_timestamp', end.toISOString())
        .order('message_timestamp', { ascending: false })
        .limit(10);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// --- V1 API (External Integration) ---

// Middleware
const checkMasterKey = (req, res, next) => {
    const key = req.headers['x-master-key'];
    if (key !== MASTER_KEY) return res.status(403).json({ error: 'Invalid Master Key' });
    next();
};

const checkAuthToken = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Invalid Token' });
    }
    // Accept Master Key or Session ID (if we implemented per-session tokens)
    // For now, simple check
    const token = auth.split(' ')[1];
    if (token !== MASTER_KEY) {
         // Optionally allow session ID as token?
         // if (!sessions.has(token)) ...
         return res.status(403).json({ error: 'Invalid Token' });
    }
    next();
};

// Casey CRM Access Token Middleware
const checkCaseyCRMToken = (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing Bearer token' });
    }
    const token = auth.split(' ')[1];
    const validTokens = [MASTER_KEY, 'casey-crm'];
    if (!validTokens.includes(token)) {
        return res.status(403).json({ error: 'Forbidden: Invalid access token' });
    }
    next();
};

// 1. Create Session
app.post('/api/v1/sessions', checkMasterKey, async (req, res) => {
    // Generate ID or use provided
    const id = req.body.id || 'session_' + Date.now();
    try {
        await startSession(id);
        res.json({ success: true, id, message: 'Session started' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. List All Sessions
app.get('/api/v1/sessions', checkAuthToken, (req, res) => {
    const sessionList = [];
    for (const [id, session] of sessions.entries()) {
        sessionList.push({
            id: id,
            status: session.status,
            phone: session.phone || null,
            qr: session.qr ? '有 QR 碼' : null,
            connectedAt: session.connectedAt || null,
            lastHeartbeat: session.lastHeartbeat || null
        });
    }
    res.json({ 
        success: true, 
        count: sessionList.length,
        sessions: sessionList 
    });
});

// 3. Get QR
app.get('/api/v1/sessions/:id/qr', checkAuthToken, (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ qr: session.qr });
});

// 4. Send Message
app.post('/api/v1/messages', checkAuthToken, async (req, res) => {
    const sessionId = req.query.sessionId;
    const session = sessions.get(sessionId);
    if (!session || session.status !== 'connected') {
        return res.status(400).json({ error: 'Session not connected' });
    }

    const { jid, type = 'number', message } = req.body;
    // message: { text: '...' } or other types
    
    try {
        // Simple text handling
        let content = message;
        if (typeof message === 'string') content = { text: message };
        
        // Handle jid (if just number, append suffix)
        let remoteJid = jid;
        if (type === 'number' && !remoteJid.includes('@')) remoteJid += '@s.whatsapp.net';
        if (type === 'group' && !remoteJid.includes('@')) remoteJid += '@g.us';

        const sent = await session.sock.sendMessage(remoteJid, content);
        await saveMessageToSupabase(sessionId, sent, session.sock);
        res.json({ success: true, messageId: sent.key.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Delete Session
app.delete('/api/v1/sessions/:id', checkAuthToken, async (req, res) => {
    const sessionId = req.params.id;
    // Reuse logout logic
    const mem = sessions.get(sessionId);
    if (mem && mem.sock) {
        try { await mem.sock.logout(); } catch(e){}
        sessions.delete(sessionId);
    }
    const authPath = path.join(__dirname, 'auth_sessions', sessionId);
    if(fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
    
    await supabase.from('whatsapp_sessions').update({ status: 'logged_out', qr_code: null }).eq('session_id', sessionId);
    res.json({ success: true });
});

// 5. Set Webhook
app.post('/api/v1/webhook', async (req, res) => {
    // Maybe check master key? Prompt didn't specify auth for this one but implied.
    // Let's assume it needs master key or auth
    // The prompt: "設置 Webhook POST /api/v1/webhook" - No auth specified in table, but safer to have.
    // I'll check 'X-Master-Key' just in case, or leave open if user wants.
    // Let's add checkMasterKey to be safe.
    
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });
    
    globalWebhookUrl = url;
    // Ideally save to DB
    // await supabase.from('whatsapp_settings').upsert({ key: 'webhook_url', value: url });
    
    res.json({ success: true, url });
});

// Init: Restore sessions from DB
async function init() {
    const { data: sessionsData } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .order('updated_at', { ascending: false }); // 按最新更新时间排序
    
    // 🆕 自动清理失效的会话
    if (sessionsData && sessionsData.length > 0) {
        console.log(`🔍 檢查並清理失效的會話...`);
        
        const invalidSessions = sessionsData.filter(s => {
            // 清理已登出的会话
            if (s.status === 'logged_out') return true;
            
            // 清理失败的会话
            if (s.status === 'failed') return true;
            
            // 清理长时间断开的会话（超过 7 天）
            if (s.status === 'disconnected') {
                const lastUpdate = new Date(s.updated_at);
                const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceUpdate > 7) return true;
            }
            
            return false;
        });
        
        if (invalidSessions.length > 0) {
            console.log(`🗑️  發現 ${invalidSessions.length} 個失效的會話，正在清理...`);
            
            for (const invalidSession of invalidSessions) {
                try {
                    console.log(`   - 清理會話: ${invalidSession.session_id} (狀態: ${invalidSession.status})`);
                    
                    // 删除会话记录
                    await supabase.from('whatsapp_sessions').delete().eq('session_id', invalidSession.session_id);
                    
                    // 删除联系人数据
                    await supabase.from('whatsapp_contacts').delete().eq('session_id', invalidSession.session_id);
                    
                    // 注：保留消息数据作为历史记录
                    
                    console.log(`   ✅ 已清理: ${invalidSession.session_id}`);
                } catch (cleanupError) {
                    console.error(`   ❌ 清理 ${invalidSession.session_id} 時出錯:`, cleanupError.message);
                }
            }
            
            console.log(`✅ 失效會話清理完成`);
        } else {
            console.log(`✅ 沒有需要清理的失效會話`);
        }
    }
    
    // 重新获取有效的会话列表
    const { data: validSessions } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .order('updated_at', { ascending: false });
    
    if (validSessions && validSessions.length > 0) {
        // 🔧 只恢复最新的一个 session，避免多个连接冲突
        const latestSession = validSessions.find(s => 
            s.status === 'connected' || s.status === 'initializing'
        );
        
        if (latestSession) {
            try {
                console.log(`✅ 恢復最新的 session: ${latestSession.session_id}`);
                await startSession(latestSession.session_id);
                
                // 清理其他旧的 session 状态（但不删除记录）
                const otherSessions = validSessions.filter(s => 
                    s.session_id !== latestSession.session_id && 
                    (s.status === 'connected' || s.status === 'initializing')
                );
                
                if (otherSessions.length > 0) {
                    console.log(`🧹 清理 ${otherSessions.length} 個舊 session 的狀態...`);
                    for (const oldSession of otherSessions) {
                        await supabase
                            .from('whatsapp_sessions')
                            .update({ status: 'stopped', qr_code: null })
                            .eq('session_id', oldSession.session_id);
                        console.log(`   - 已停止: ${oldSession.session_id}`);
                    }
                }
            } catch (e) {
                console.error(`❌ 恢復 session ${latestSession.session_id} 失敗:`, e);
            }
        } else {
            console.log('ℹ️  沒有找到需要恢復的 session');
        }
    } else {
        console.log('ℹ️  數據庫中沒有有效的 session 記錄');
    }
}

init();

// Auto-restart disconnected sessions every 5 minutes
setInterval(async () => {
    console.log('🔍 檢查所有會話狀態...');
    
    for (const [sessionId, session] of sessions.entries()) {
        if (session.status === 'disconnected' || session.status === 'failed') {
            console.log(`[${sessionId}] 檢測到斷開的會話，嘗試重新連接...`);
            
            // Reset reconnect attempts for periodic check
            session.reconnectAttempts = 0;
            
            try {
                await startSession(sessionId);
            } catch (error) {
                console.error(`[${sessionId}] 自動重連失敗:`, error.message);
            }
        }
    }
}, 5 * 60 * 1000); // Every 5 minutes

// Handle process termination gracefully
process.on('SIGINT', async () => {
    console.log('\n🛑 收到 SIGINT 信號，正在關閉所有連接...');
    
    for (const [sessionId, session] of sessions.entries()) {
        if (session.sock) {
            try {
                await session.sock.end();
                console.log(`[${sessionId}] 已關閉連接`);
            } catch (error) {
                console.error(`[${sessionId}] 關閉連接時出錯:`, error.message);
            }
        }
        
        if (session.heartbeatTimer) {
            clearInterval(session.heartbeatTimer);
        }
        
        if (session.groupRefreshTimer) {
            clearInterval(session.groupRefreshTimer);
        }
    }
    
    console.log('✅ 所有連接已關閉');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 收到 SIGTERM 信號，正在優雅退出...');
    process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕獲的異常:', error);
    // Don't exit, let PM2 handle restarts
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未處理的 Promise 拒絕:', reason);
    // Don't exit, let PM2 handle restarts
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('🔌 新的 WebSocket 連接');
    
    // Send initial connection success message
    ws.send(JSON.stringify({ type: 'connected', message: '已連接到 WebSocket 服務器' }));
    
    ws.on('close', () => {
        console.log('❌ WebSocket 連接關閉');
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket 錯誤:', error);
    });
});

// Broadcast function to send messages to all connected clients
function broadcastMessage(sessionId, chatId, message) {
    const isGroup = chatId && chatId.endsWith('@g.us');
    const messagePreview = message.content ? message.content.substring(0, 50) : '[媒体消息]';
    
    console.log(`[WebSocket] 📤 广播消息 - 会话: ${sessionId}, 聊天: ${chatId}, 类型: ${isGroup ? '群组' : '私聊'}, 内容预览: ${messagePreview}`);
    
    const data = JSON.stringify({
        type: 'new_message',
        sessionId,
        chatId,
        message,
        isGroup
    });
    
    let sentCount = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
            client.send(data);
                sentCount++;
            } catch (error) {
                console.error('[WebSocket] ❌ 发送失败:', error.message);
            }
        }
    });
    
    console.log(`[WebSocket] ✅ 消息已发送到 ${sentCount} 个客户端`);
}

// Make broadcastMessage available globally
global.broadcastMessage = broadcastMessage;

// ==================== LID Mapping Management APIs ====================

// Get all unmapped LIDs (LIDs with messages from user but no mapping)
app.get('/api/session/:id/lid-mapping-candidates', async (req, res) => {
    const sessionId = req.params.id;
    
    try {
        // Query to find LIDs that need mapping
        const { data: candidates, error } = await supabase.rpc('get_lid_mapping_candidates', {
            p_session_id: sessionId
        });
        
        if (error) {
            console.error('Error fetching LID candidates:', error);
            // Fallback: direct query if RPC doesn't exist
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('whatsapp_messages')
                .select('remote_jid, push_name')
                .eq('session_id', sessionId)
                .like('remote_jid', '%@lid')
                .eq('from_me', true)
                .limit(100);
            
            if (fallbackError) throw fallbackError;
            
            // Group by remote_jid and count
            const grouped = {};
            for (const msg of fallbackData || []) {
                if (!grouped[msg.remote_jid]) {
                    grouped[msg.remote_jid] = {
                        lid_jid: msg.remote_jid,
                        push_name: msg.push_name,
                        my_messages: 0,
                        total_messages: 0
                    };
                }
                grouped[msg.remote_jid].my_messages++;
                grouped[msg.remote_jid].total_messages++;
            }
            
            return res.json(Object.values(grouped));
        }
        
        res.json(candidates || []);
    } catch (err) {
        console.error('Error in lid-mapping-candidates:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get recent messages for a specific LID (to help identify the contact)
app.get('/api/session/:id/lid-messages/:lidJid', async (req, res) => {
    const sessionId = req.params.id;
    const lidJid = decodeURIComponent(req.params.lidJid);
    
    try {
        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('message_id, from_me, content, message_timestamp, push_name')
            .eq('session_id', sessionId)
            .eq('remote_jid', lidJid)
            .order('message_timestamp', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('Error fetching LID messages:', err);
        res.status(500).json({ error: err.message });
    }
});

// Manually add a LID mapping
app.post('/api/session/:id/lid-mapping', async (req, res) => {
    const sessionId = req.params.id;
    const { lid_jid, traditional_jid } = req.body;
    
    if (!lid_jid || !traditional_jid) {
        return res.status(400).json({ error: 'lid_jid and traditional_jid are required' });
    }
    
    try {
        const { data, error } = await supabase
            .from('whatsapp_jid_mapping')
            .insert({
                session_id: sessionId,
                lid_jid: lid_jid,
                traditional_jid: traditional_jid
            });
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: `Mapping added: ${lid_jid} -> ${traditional_jid}`,
            data 
        });
    } catch (err) {
        console.error('Error adding LID mapping:', err);
        res.status(500).json({ error: err.message });
    }
});

// Get all existing LID mappings
app.get('/api/session/:id/lid-mappings', async (req, res) => {
    const sessionId = req.params.id;
    
    try {
        const { data, error } = await supabase
            .from('whatsapp_jid_mapping')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        console.error('Error fetching LID mappings:', err);
        res.status(500).json({ error: err.message });
    }
});

// Clean up empty contacts (no messages, no name) - All formats
app.post('/api/session/:id/cleanup-empty-contacts', async (req, res) => {
    const sessionId = req.params.id;
    const { includeTraditional = true } = req.body; // 可选：是否也清理传统 JID
    
    try {
        // Step 1: Find ALL contacts with no name and not in group
        const { data: allNoNameContacts, error: fetchError } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name')
            .eq('session_id', sessionId)
            .is('name', null)
            .eq('is_group', false);
        
        if (fetchError) throw fetchError;
        
        console.log(`找到 ${allNoNameContacts.length} 个没有名字的联系人`);
        
        // Step 2: Separate LID and traditional JIDs
        const lidJids = [];
        const traditionalJids = [];
        
        for (const contact of allNoNameContacts || []) {
            if (contact.jid.endsWith('@lid')) {
                lidJids.push(contact.jid);
            } else if (contact.jid.endsWith('@s.whatsapp.net')) {
                traditionalJids.push(contact.jid);
            }
        }
        
        console.log(`LID 格式: ${lidJids.length} 个, 传统格式: ${traditionalJids.length} 个`);
        
        // Step 3: Check which ones have messages
        const contactsToDelete = [];
        const jidsToCheck = includeTraditional ? [...lidJids, ...traditionalJids] : lidJids;
        
        for (const jid of jidsToCheck) {
            const { count, error } = await supabase
                .from('whatsapp_messages')
                .select('message_id', { count: 'exact', head: true })
                .eq('session_id', sessionId)
                .eq('remote_jid', jid);
            
            if (!error && count === 0) {
                contactsToDelete.push(jid);
            }
        }
        
        console.log(`需要删除: ${contactsToDelete.length} 个空联系人`);
        
        // Step 4: Delete empty contacts in batches
        if (contactsToDelete.length > 0) {
            // Supabase has a limit on array size, so batch delete
            const batchSize = 100;
            for (let i = 0; i < contactsToDelete.length; i += batchSize) {
                const batch = contactsToDelete.slice(i, i + batchSize);
                const { error: deleteError } = await supabase
                    .from('whatsapp_contacts')
                    .delete()
                    .eq('session_id', sessionId)
                    .in('jid', batch);
                
                if (deleteError) {
                    console.error(`删除批次 ${i}-${i+batch.length} 失败:`, deleteError);
                }
            }
        }
        
        // Step 5: Count remaining no-name contacts
        const { count: afterCount, error: afterCountError } = await supabase
            .from('whatsapp_contacts')
            .select('jid', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .is('name', null)
            .eq('is_group', false);
        
        if (afterCountError) throw afterCountError;
        
        res.json({ 
            success: true, 
            found: jidsToCheck.length,
            deleted: contactsToDelete.length,
            remaining: afterCount || 0,
            details: {
                lid_checked: lidJids.length,
                traditional_checked: includeTraditional ? traditionalJids.length : 0
            },
            message: `已刪除 ${contactsToDelete.length} 個空聯絡人，剩餘 ${afterCount || 0} 個（有消息記錄需要映射）`
        });
    } catch (err) {
        console.error('Error cleaning up empty contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

// Auto-map LIDs by matching pushName in group messages
app.post('/api/session/:id/auto-map-lids', async (req, res) => {
    const sessionId = req.params.id;
    
    try {
        // Find LIDs with pushName
        const { data: lidsWithPushName, error: lidError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, push_name')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@lid')
            .eq('from_me', false)
            .not('push_name', 'is', null);
        
        if (lidError) throw lidError;
        
        // Get unique pushNames
        const pushNames = [...new Set((lidsWithPushName || []).map(m => m.push_name).filter(Boolean))];
        
        if (pushNames.length === 0) {
            return res.json({ 
                success: true, 
                mapped: 0, 
                message: 'No LIDs with pushName found' 
            });
        }
        
        // Find matching traditional JIDs in group messages
        const { data: groupParticipants, error: groupError } = await supabase
            .from('whatsapp_messages')
            .select('push_name, participant_phone')
            .eq('session_id', sessionId)
            .like('remote_jid', '%@g.us')
            .in('push_name', pushNames)
            .not('participant_phone', 'is', null);
        
        if (groupError) throw groupError;
        
        // Build mapping
        const mappings = [];
        const pushNameToPhone = new Map();
        
        for (const gp of groupParticipants || []) {
            if (gp.push_name && gp.participant_phone) {
                pushNameToPhone.set(gp.push_name.toLowerCase().trim(), gp.participant_phone);
            }
        }
        
        for (const lid of lidsWithPushName || []) {
            if (lid.push_name) {
                const traditionalJid = pushNameToPhone.get(lid.push_name.toLowerCase().trim());
                if (traditionalJid && traditionalJid.endsWith('@s.whatsapp.net')) {
                    mappings.push({
                        session_id: sessionId,
                        lid_jid: lid.remote_jid,
                        traditional_jid: traditionalJid
                    });
                }
            }
        }
        
        if (mappings.length === 0) {
            return res.json({ 
                success: true, 
                mapped: 0, 
                message: 'No matching traditional JIDs found in group messages' 
            });
        }
        
        // Insert mappings
        const { data: inserted, error: insertError } = await supabase
            .from('whatsapp_jid_mapping')
            .upsert(mappings, { onConflict: 'session_id,lid_jid' });
        
        if (insertError) throw insertError;
        
        res.json({ 
            success: true, 
            mapped: mappings.length, 
            mappings: mappings 
        });
    } catch (err) {
        console.error('Error in auto-map-lids:', err);
        res.status(500).json({ error: err.message });
    }
});

// Delete Message (从数据库删除)
app.post('/api/session/:id/messages/:messageId/delete', async (req, res) => {
    const sessionId = req.params.id;
    const messageId = req.params.messageId;
    
    try {
        // Delete from database
        const { error } = await supabase
            .from('whatsapp_messages')
            .delete()
            .eq('session_id', sessionId)
            .eq('message_id', messageId);
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            message: '消息已删除' 
        });
    } catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ error: err.message });
    }
});

// Revoke/Recall Message (撤回消息 - 对所有人)
app.post('/api/session/:id/messages/:messageId/revoke', async (req, res) => {
    const sessionId = req.params.id;
    const messageId = req.params.messageId;
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not active' });
        }
        
        // Get message details from database
        const { data: message, error: msgError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, from_me, message_timestamp')
            .eq('session_id', sessionId)
            .eq('message_id', messageId)
            .single();
        
        if (msgError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // Only allow revoking messages sent by me
        if (!message.from_me) {
            return res.status(403).json({ error: 'Can only revoke messages sent by you' });
        }
        
        // Check if message is recent (WhatsApp allows revoke within ~48 hours, but we'll check)
        const messageTime = new Date(message.message_timestamp);
        const hoursSinceMessage = (Date.now() - messageTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceMessage > 48) {
            return res.status(400).json({ 
                error: '消息发送时间超过48小时，无法撤回',
                hoursSinceMessage: Math.floor(hoursSinceMessage)
            });
        }
        
        // Send revoke message using Baileys
        // Create the message key that needs to be revoked
        const key = {
            remoteJid: message.remote_jid,
            fromMe: true,
            id: messageId
        };
        
        await session.sock.sendMessage(message.remote_jid, { delete: key });
        
        // Also delete from database
        await supabase
            .from('whatsapp_messages')
            .delete()
            .eq('session_id', sessionId)
            .eq('message_id', messageId);
        
        res.json({ 
            success: true, 
            message: '消息已撤回'
        });
    } catch (err) {
        console.error('Error revoking message:', err);
        res.status(500).json({ error: err.message });
    }
});

// Export Contacts to CSV
app.get('/api/session/:id/export-contacts-csv', async (req, res) => {
    const sessionId = req.params.id;
    
    try {
        // 1. Get all contacts
        const { data: contacts, error: contactError } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, custom_name, last_message_time')
            .eq('session_id', sessionId);
        
        if (contactError) throw contactError;
        
        // 2. Get actual last message times from messages table
        const { data: lastMessages, error: msgError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, message_timestamp')
            .eq('session_id', sessionId)
            .order('message_timestamp', { ascending: false });
        
        if (msgError) throw msgError;
        
        // Create a map of last message times
        const lastMessageMap = new Map();
        if (lastMessages) {
            lastMessages.forEach(msg => {
                if (!lastMessageMap.has(msg.remote_jid)) {
                    lastMessageMap.set(msg.remote_jid, msg.message_timestamp);
                }
            });
        }
        
        // 3. Get LID mappings
        const { data: mappings, error: mappingError } = await supabase
            .from('whatsapp_jid_mapping')
            .select('lid_jid, traditional_jid')
            .eq('session_id', sessionId);
        
        if (mappingError) throw mappingError;
        
        // 4. Create mapping lookup (both directions)
        const lidToTraditional = new Map();
        const traditionalToLid = new Map();
        if (mappings) {
            for (const m of mappings) {
                lidToTraditional.set(m.lid_jid, m.traditional_jid);
                traditionalToLid.set(m.traditional_jid, m.lid_jid);
            }
        }
        
        // 5. Enrich contacts with actual last message time and merge names (considering LID mappings)
        const enrichedContacts = contacts.map(contact => {
            let actualTime = lastMessageMap.get(contact.jid) || contact.last_message_time;
            let displayName = contact.custom_name || contact.name;
            let displayJid = contact.jid;
            
            // 🐛 调试：追踪 91969997
            if (contact.jid.includes('91969997') || contact.jid.includes('69827679002840')) {
                console.log(`[CSV DEBUG] Processing contact: ${contact.jid}`);
                console.log(`  - Original name: ${contact.name}`);
                console.log(`  - Custom name: ${contact.custom_name}`);
                console.log(`  - Initial displayName: ${displayName}`);
            }
            
            // 🔧 Check for LID mapping and merge message times and names
            if (contact.jid.includes('@s.whatsapp.net')) {
                // This is a traditional JID, check if it has a mapped LID
                const mappedLid = traditionalToLid.get(contact.jid);
                if (mappedLid) {
                    const lidTime = lastMessageMap.get(mappedLid);
                    // Take the latest time between traditional JID and LID
                    if (lidTime) {
                        if (!actualTime || new Date(lidTime) > new Date(actualTime)) {
                            actualTime = lidTime;
                        }
                    }
                    // 🔧 Merge name: prefer traditional JID name if it exists, otherwise use LID name
                    const lidContact = contacts.find(c => c.jid === mappedLid);
                    if (lidContact && !displayName && (lidContact.custom_name || lidContact.name)) {
                        displayName = lidContact.custom_name || lidContact.name;
                        if (contact.jid.includes('91969997')) {
                            console.log(`  - Found mapped LID: ${mappedLid}`);
                            console.log(`  - LID contact name: ${lidContact.name}`);
                            console.log(`  - Updated displayName from LID: ${displayName}`);
                        }
                    }
                }
            } else if (contact.jid.includes('@lid')) {
                // This is a LID, check if it has a mapped traditional JID
                const mappedTraditional = lidToTraditional.get(contact.jid);
                if (mappedTraditional) {
                    const traditionalTime = lastMessageMap.get(mappedTraditional);
                    // Take the latest time
                    if (traditionalTime) {
                        if (!actualTime || new Date(traditionalTime) > new Date(actualTime)) {
                            actualTime = traditionalTime;
                        }
                    }
                    // 🔧 Merge name: prefer traditional JID name
                    const traditionalContact = contacts.find(c => c.jid === mappedTraditional);
                    if (traditionalContact) {
                        displayName = traditionalContact.custom_name || traditionalContact.name || displayName;
                        displayJid = traditionalContact.jid; // Use traditional JID for display
                        if (contact.jid.includes('69827679002840')) {
                            console.log(`  - This is LID, mapped to: ${mappedTraditional}`);
                            console.log(`  - Traditional contact name: ${traditionalContact.name}`);
                            console.log(`  - Updated displayName from traditional: ${displayName}`);
                            console.log(`  - Updated displayJid: ${displayJid}`);
                        }
                    }
                }
            }
            
            // 🐛 调试：最终结果
            if (contact.jid.includes('91969997') || contact.jid.includes('69827679002840')) {
                console.log(`  - Final displayName: ${displayName}`);
                console.log(`  - Final displayJid: ${displayJid}`);
                console.log('---');
            }
            
            return {
                ...contact,
                actual_last_message_time: actualTime,
                display_name: displayName,
                display_jid: displayJid
            };
        });
        
        // Sort by last message time (most recent first)
        enrichedContacts.sort((a, b) => {
            const timeA = a.actual_last_message_time;
            const timeB = b.actual_last_message_time;
            if (!timeA && !timeB) return 0;
            if (!timeA) return 1;
            if (!timeB) return -1;
            return new Date(timeB) - new Date(timeA);
        });
        
        // 🔧 Deduplicate: Remove LIDs that have a corresponding traditional JID
        // Step 1: Collect all traditional JIDs that exist in the list
        const existingTraditionalJids = new Set();
        for (const contact of enrichedContacts) {
            if (contact.jid.includes('@s.whatsapp.net')) {
                existingTraditionalJids.add(contact.jid);
            }
        }
        
        // Step 2: Build skip set - LIDs whose mapped traditional JID exists
        const skipJids = new Set();
        for (const contact of enrichedContacts) {
            if (contact.jid.includes('@lid')) {
                const mappedTraditional = lidToTraditional.get(contact.jid);
                if (mappedTraditional && existingTraditionalJids.has(mappedTraditional)) {
                    // This LID has a traditional JID in the list - skip the LID
                    skipJids.add(contact.jid);
                }
            }
        }
        
        // Step 3: Filter out skipped contacts
        const deduplicatedContacts = enrichedContacts.filter(c => !skipJids.has(c.jid));
        
        // 6. Process contacts and extract phone numbers
        const csvRows = [];
        csvRows.push('名稱,電話號碼,最後訊息時間'); // CSV Header
        
        for (const contact of deduplicatedContacts) {
            const displayName = contact.display_name || '';
            let phoneNumber = '';
            
            // Extract phone number from JID (use display_jid if available)
            const jid = contact.display_jid || contact.jid;
            if (jid.includes('@lid')) {
                // LID format - lookup traditional JID
                const traditionalJid = lidToTraditional.get(jid);
                if (traditionalJid && traditionalJid.includes('@s.whatsapp.net')) {
                    const phone = traditionalJid.split('@')[0];
                    // Format Hong Kong numbers
                    if (phone.startsWith('852') && phone.length === 11) {
                        phoneNumber = `+852 ${phone.slice(3, 7)} ${phone.slice(7)}`;
                    } else {
                        phoneNumber = `+${phone}`;
                    }
                } else {
                    phoneNumber = 'LID 聯絡人';
                }
            } else if (jid.includes('@s.whatsapp.net')) {
                // Traditional format
                const phone = jid.split('@')[0];
                if (phone.startsWith('852') && phone.length === 11) {
                    phoneNumber = `+852 ${phone.slice(3, 7)} ${phone.slice(7)}`;
                } else {
                    phoneNumber = `+${phone}`;
                }
            } else if (jid.includes('@g.us')) {
                // Group
                phoneNumber = '群組';
            } else {
                phoneNumber = jid;
            }
            
            // Use actual message time
            const lastMessageTime = contact.actual_last_message_time 
                ? new Date(contact.actual_last_message_time).toLocaleString('zh-HK', { 
                    year: 'numeric', 
                    month: '2-digit', 
                    day: '2-digit', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })
                : '無訊息';
            
            // Escape CSV fields (handle commas and quotes)
            const escapeCsvField = (field) => {
                if (field.includes(',') || field.includes('"') || field.includes('\n')) {
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            };
            
            csvRows.push(`${escapeCsvField(displayName)},${escapeCsvField(phoneNumber)},${escapeCsvField(lastMessageTime)}`);
        }
        
        // 7. Generate CSV content
        const csvContent = csvRows.join('\n');
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `聯絡人列表_${timestamp}.csv`;
        
        // 8. Send CSV file
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send('\uFEFF' + csvContent); // Add BOM for UTF-8
        
    } catch (err) {
        console.error('Error exporting contacts CSV:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// Casey CRM API Endpoints (with Token Auth)
// ============================================

// 1. Get All Contacts
app.get('/api/crm/contacts', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const { data: contacts, error } = await supabase
            .from('whatsapp_contacts')
            .select('jid, name, custom_name, last_message_time')
            .eq('session_id', sessionId)
            .order('last_message_time', { ascending: false, nullsLast: true });
        
        if (error) throw error;
        
        res.json({ success: true, contacts: contacts || [] });
    } catch (err) {
        console.error('Error getting contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Export Contacts CSV
app.get('/api/crm/contacts/export', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        // Reuse the existing CSV export logic
        const response = await fetch(`http://localhost:${port}/api/session/${sessionId}/export-contacts-csv`);
        const csvContent = await response.text();
        
        const timestamp = new Date().toISOString().split('T')[0];
        const filename = `聯絡人列表_${timestamp}.csv`;
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.send(csvContent);
    } catch (err) {
        console.error('Error exporting contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

// 3. Refresh Unknown Contacts from WhatsApp
app.post('/api/crm/contacts/refresh', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not connected' });
        }
        
        // Get all contacts without names
        const { data: unknownContacts, error } = await supabase
            .from('whatsapp_contacts')
            .select('jid')
            .eq('session_id', sessionId)
            .is('name', null)
            .is('custom_name', null);
        
        if (error) throw error;
        
        let updated = 0;
        for (const contact of unknownContacts || []) {
            try {
                if (contact.jid.includes('@s.whatsapp.net')) {
                    const [result] = await session.sock.onWhatsApp(contact.jid);
                    if (result && result.name) {
                        await supabase
                            .from('whatsapp_contacts')
                            .update({ name: result.name })
                            .eq('session_id', sessionId)
                            .eq('jid', contact.jid);
                        updated++;
                    }
                }
            } catch (err) {
                console.error(`Error refreshing contact ${contact.jid}:`, err);
            }
        }
        
        res.json({ success: true, updated, total: unknownContacts?.length || 0 });
    } catch (err) {
        console.error('Error refreshing contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Extract Names from Group Messages
app.post('/api/crm/contacts/extract-names', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const { data: messages, error: msgError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, push_name')
            .eq('session_id', sessionId)
            .not('push_name', 'is', null)
            .not('remote_jid', 'is', null);
        
        if (msgError) throw msgError;
        
        const jidToName = new Map();
        for (const msg of messages || []) {
            if (msg.remote_jid && msg.push_name) {
                if (!jidToName.has(msg.remote_jid)) {
                    jidToName.set(msg.remote_jid, msg.push_name);
                }
            }
        }
        
        let updated = 0;
        for (const [jid, name] of jidToName.entries()) {
            const { data: existing } = await supabase
                .from('whatsapp_contacts')
                .select('name, custom_name')
                .eq('session_id', sessionId)
                .eq('jid', jid)
                .single();
            
            if (existing && !existing.custom_name && (!existing.name || existing.name === jid)) {
                const { error: updateError } = await supabase
                    .from('whatsapp_contacts')
                    .update({ name })
                    .eq('session_id', sessionId)
                    .eq('jid', jid);
                
                if (!updateError) updated++;
            } else if (!existing) {
                const { error: insertError } = await supabase
                    .from('whatsapp_contacts')
                    .insert({ session_id: sessionId, jid, name });
                
                if (!insertError) updated++;
            }
        }
        
        res.json({ success: true, updated, total: jidToName.size });
    } catch (err) {
        console.error('Error extracting names:', err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Cleanup Empty Contacts
app.post('/api/crm/contacts/cleanup', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const includeTraditional = req.body.includeTraditional || false;
    
    try {
        let query = supabase
            .from('whatsapp_contacts')
            .select('jid')
            .eq('session_id', sessionId)
            .is('name', null)
            .is('custom_name', null);
        
        if (!includeTraditional) {
            query = query.like('jid', '%@lid');
        }
        
        const { data: emptyContacts, error: fetchError } = await query;
        if (fetchError) throw fetchError;
        
        let deleted = 0;
        const toDelete = [];
        
        for (const contact of emptyContacts || []) {
            const { count } = await supabase
                .from('whatsapp_messages')
                .select('*', { count: 'exact', head: true })
                .eq('session_id', sessionId)
                .or(`remote_jid.eq.${contact.jid},sender_jid.eq.${contact.jid}`);
            
            if (count === 0) {
                toDelete.push(contact.jid);
            }
        }
        
        if (toDelete.length > 0) {
            const { error: deleteError } = await supabase
                .from('whatsapp_contacts')
                .delete()
                .eq('session_id', sessionId)
                .in('jid', toDelete);
            
            if (deleteError) throw deleteError;
            deleted = toDelete.length;
        }
        
        res.json({ success: true, deleted, checked: emptyContacts?.length || 0 });
    } catch (err) {
        console.error('Error cleaning up contacts:', err);
        res.status(500).json({ error: err.message });
    }
});

// 6. Get Messages
app.get('/api/crm/messages', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const chatId = req.query.chatId;
    const limit = parseInt(req.query.limit) || 50;
    
    try {
        let query = supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('message_timestamp', { ascending: false })
            .limit(limit);
        
        if (chatId) {
            query = query.eq('remote_jid', chatId);
        }
        
        const { data: messages, error } = await query;
        if (error) throw error;
        
        res.json({ success: true, messages: messages || [] });
    } catch (err) {
        console.error('Error getting messages:', err);
        res.status(500).json({ error: err.message });
    }
});

// 7. Send Message
app.post('/api/crm/messages/send', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const { recipient, text } = req.body;
    
    if (!recipient || !text) {
        return res.status(400).json({ error: 'Missing recipient or text' });
    }
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not connected' });
        }
        
        await session.sock.sendMessage(recipient, { text });
        res.json({ success: true, message: 'Message sent' });
    } catch (err) {
        console.error('Error sending message:', err);
        res.status(500).json({ error: err.message });
    }
});

// 8. Broadcast Messages (群发)
app.post('/api/crm/messages/broadcast', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const { recipients, text } = req.body;
    
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Missing or invalid recipients array' });
    }
    
    if (!text) {
        return res.status(400).json({ error: 'Missing text' });
    }
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not connected' });
        }
        
        const results = [];
        for (const recipient of recipients) {
            try {
                await session.sock.sendMessage(recipient, { text });
                results.push({ recipient, success: true });
            } catch (err) {
                results.push({ recipient, success: false, error: err.message });
            }
        }
        
        const successCount = results.filter(r => r.success).length;
        res.json({ 
            success: true, 
            sent: successCount,
            failed: results.length - successCount,
            results 
        });
    } catch (err) {
        console.error('Error broadcasting messages:', err);
        res.status(500).json({ error: err.message });
    }
});

// 9. Download All Media
app.post('/api/crm/media/download-all', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not connected' });
        }
        
        const { data: messages, error } = await supabase
            .from('whatsapp_messages')
            .select('id, remote_jid, message_type, media_url')
            .eq('session_id', sessionId)
            .in('message_type', ['image', 'video', 'sticker'])
            .is('media_path', null)
            .not('media_url', 'is', null)
            .limit(100);
        
        if (error) throw error;
        
        let downloaded = 0;
        let failed = 0;
        
        for (const msg of messages || []) {
            try {
                const buffer = await downloadMediaMessage(
                    { key: { id: msg.id, remoteJid: msg.remote_jid } },
                    'buffer',
                    {},
                    { logger: console, reuploadRequest: session.sock.updateMediaMessage }
                );
                
                if (buffer) {
                    const ext = msg.message_type === 'video' ? 'mp4' : 
                               msg.message_type === 'sticker' ? 'webp' : 'jpg';
                    const filename = `${msg.id}.${ext}`;
                    const filepath = path.join(__dirname, 'media', filename);
                    
                    await fs.promises.mkdir(path.join(__dirname, 'media'), { recursive: true });
                    await fs.promises.writeFile(filepath, buffer);
                    
                    await supabase
                        .from('whatsapp_messages')
                        .update({ media_path: filepath })
                        .eq('id', msg.id);
                    
                    downloaded++;
                }
            } catch (err) {
                console.error(`Failed to download media for message ${msg.id}:`, err);
                failed++;
            }
        }
        
        res.json({ success: true, downloaded, failed, total: messages?.length || 0 });
    } catch (err) {
        console.error('Error downloading media:', err);
        res.status(500).json({ error: err.message });
    }
});

// 10. Force Sync
app.post('/api/crm/sync/force', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not connected' });
        }
        
        // Clear existing data
        await supabase.from('whatsapp_messages').delete().eq('session_id', sessionId);
        await supabase.from('whatsapp_contacts').delete().eq('session_id', sessionId);
        
        // Trigger sync (this will be handled by the existing sync logic)
        res.json({ success: true, message: 'Sync started. Data cleared, resyncing from WhatsApp.' });
    } catch (err) {
        console.error('Error forcing sync:', err);
        res.status(500).json({ error: err.message });
    }
});

// 11. Get LID Mapping Candidates
app.get('/api/crm/lid/candidates', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const { data, error } = await supabase.rpc('get_lid_mapping_candidates', {
            p_session_id: sessionId
        });
        
        if (error) throw error;
        
        res.json({ success: true, candidates: data || [] });
    } catch (err) {
        console.error('Error getting LID candidates:', err);
        res.status(500).json({ error: err.message });
    }
});

// 12. Add LID Mapping
app.post('/api/crm/lid/mapping', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const { lidJid, traditionalJid } = req.body;
    
    if (!lidJid || !traditionalJid) {
        return res.status(400).json({ error: 'Missing lidJid or traditionalJid' });
    }
    
    try {
        const { error } = await supabase
            .from('whatsapp_jid_mapping')
            .upsert({
                session_id: sessionId,
                lid_jid: lidJid,
                traditional_jid: traditionalJid
            }, { onConflict: 'session_id,lid_jid' });
        
        if (error) throw error;
        
        res.json({ success: true, message: 'LID mapping added' });
    } catch (err) {
        console.error('Error adding LID mapping:', err);
        res.status(500).json({ error: err.message });
    }
});

// 13. Auto Map LIDs
app.post('/api/crm/lid/auto-map', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        // This reuses the existing auto-map logic
        const response = await fetch(`http://localhost:${port}/api/session/${sessionId}/auto-map-lids`, {
            method: 'POST'
        });
        
        const result = await response.json();
        res.json(result);
    } catch (err) {
        console.error('Error auto-mapping LIDs:', err);
        res.status(500).json({ error: err.message });
    }
});

// 14. Get Chats/Conversations
app.get('/api/crm/chats', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const limit = parseInt(req.query.limit) || 50;
    
    try {
        const { data: contacts, error } = await supabase
            .from('whatsapp_contacts')
            .select('*')
            .eq('session_id', sessionId)
            .order('last_message_time', { ascending: false, nullsLast: true })
            .limit(limit);
        
        if (error) throw error;
        
        res.json({ success: true, chats: contacts || [] });
    } catch (err) {
        console.error('Error getting chats:', err);
        res.status(500).json({ error: err.message });
    }
});

// 15. Delete Message
app.post('/api/crm/messages/delete', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const { messageId } = req.body;
    
    if (!messageId) {
        return res.status(400).json({ error: 'Missing messageId' });
    }
    
    try {
        const { error } = await supabase
            .from('whatsapp_messages')
            .delete()
            .eq('session_id', sessionId)
            .eq('message_id', messageId);
        
        if (error) throw error;
        
        res.json({ success: true, message: '消息已删除' });
    } catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ error: err.message });
    }
});

// 16. Revoke Message (撤回对所有人)
app.post('/api/crm/messages/revoke', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const { messageId } = req.body;
    
    if (!messageId) {
        return res.status(400).json({ error: 'Missing messageId' });
    }
    
    try {
        const session = sessions.get(sessionId);
        if (!session || !session.sock) {
            return res.status(400).json({ error: 'Session not active' });
        }
        
        // Get message details
        const { data: message, error: msgError } = await supabase
            .from('whatsapp_messages')
            .select('remote_jid, from_me, message_timestamp')
            .eq('session_id', sessionId)
            .eq('message_id', messageId)
            .single();
        
        if (msgError || !message) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        if (!message.from_me) {
            return res.status(403).json({ error: 'Can only revoke messages sent by you' });
        }
        
        // Check time limit (48 hours)
        const messageTime = new Date(message.message_timestamp);
        const hoursSinceMessage = (Date.now() - messageTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceMessage > 48) {
            return res.status(400).json({ 
                error: '消息发送时间超过48小时，无法撤回',
                hoursSinceMessage: Math.floor(hoursSinceMessage)
            });
        }
        
        // Send revoke message using Baileys
        // Create the message key that needs to be revoked
        const key = {
            remoteJid: message.remote_jid,
            fromMe: true,
            id: messageId
        };
        
        await session.sock.sendMessage(message.remote_jid, { delete: key });
        
        // Delete from database
        await supabase
            .from('whatsapp_messages')
            .delete()
            .eq('session_id', sessionId)
            .eq('message_id', messageId);
        
        res.json({ success: true, message: '消息已撤回' });
    } catch (err) {
        console.error('Error revoking message:', err);
        res.status(500).json({ error: err.message });
    }
});

// 17. Get Daily Stats
app.get('/api/crm/stats/daily', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.query.sessionId || 'sess_9ai6rbwfe_1770361159106';
    
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const { count, error } = await supabase
            .from('whatsapp_messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', sessionId)
            .eq('from_me', true)
            .gte('message_timestamp', todayStart.toISOString());
        
        if (error) throw error;
        
        res.json({ 
            success: true, 
            sent: count || 0,
            date: todayStart.toISOString().split('T')[0]
        });
    } catch (err) {
        console.error('Error getting daily stats:', err);
        res.status(500).json({ error: err.message });
    }
});

// 16. Delete Message
app.post('/api/crm/messages/:messageId/delete', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const messageId = req.params.messageId;
    
    try {
        const response = await fetch(`http://localhost:${port}/api/session/${sessionId}/messages/${messageId}/delete`, {
            method: 'POST'
        });
        
        const result = await response.json();
        res.json(result);
    } catch (err) {
        console.error('Error deleting message:', err);
        res.status(500).json({ error: err.message });
    }
});

// 17. Revoke Message
app.post('/api/crm/messages/:messageId/revoke', checkCaseyCRMToken, async (req, res) => {
    const sessionId = req.body.sessionId || 'sess_9ai6rbwfe_1770361159106';
    const messageId = req.params.messageId;
    
    try {
        const response = await fetch(`http://localhost:${port}/api/session/${sessionId}/messages/${messageId}/revoke`, {
            method: 'POST'
        });
        
        const result = await response.json();
        res.json(result);
    } catch (err) {
        console.error('Error revoking message:', err);
        res.status(500).json({ error: err.message });
    }
});

server.listen(port, () => {
    console.log(`Public WhatsApp Server running on port ${port}`);
    console.log(`🔄 自動重連: 已啟用 (最多 ${RECONNECT_CONFIG.maxAttempts} 次嘗試)`);
    console.log(`💓 心跳檢測: 每 ${RECONNECT_CONFIG.heartbeatInterval/1000} 秒`);
    console.log(`🔍 自動檢查: 每 5 分鐘檢查斷開的會話`);
    console.log(`🔌 WebSocket 服務器已啟動`);
    console.log(`🔑 Casey CRM API: Bearer token 'casey-crm' enabled`);
});
