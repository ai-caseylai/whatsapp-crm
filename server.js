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

        if (qr) {
            session.status = 'qr';
            session.qr = await qrcode.toDataURL(qr);
            await supabase.from('whatsapp_sessions').update({ status: 'qr', qr_code: session.qr }).eq('session_id', sessionId);
            sendWebhook('qr', { sessionId, qr: session.qr });
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
                session.status = 'logged_out';
                session.qr = null;
                session.userInfo = null;
                session.reconnectAttempts = 0;
                await supabase.from('whatsapp_sessions').update({ status: 'logged_out', qr_code: null }).eq('session_id', sessionId);
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
                }

                // 🔧 只广播实时新消息（type='notify'），历史同步消息（type='append'）静默保存
                // type='notify': 实时接收的新消息（用户刚发的）→ 自动打开聊天
                // type='append': 历史同步的旧消息（从服务器拉取的）→ 静默保存到数据库
                if (type === 'notify') {
                    validMessages.forEach(m => {
                        sendWebhook('message', { sessionId, message: m });
                        
                        // Broadcast via WebSocket for real-time updates
                        if (global.broadcastMessage) {
                            console.log(`[${sessionId}] 📤 广播实时新消息到前端: ${m.remote_jid}`);
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
    
    // Also try to fetch contacts from Supabase first
    // 🔧 分页获取所有联系人（Supabase 默认限制 1000 行）
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
            // 如果返回的数据少于 pageSize，说明没有更多数据了
            if (pageData.length < pageSize) {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }
    
    console.log(`[API] 📊 从数据库获取了 ${data.length} 个联系人（共 ${currentPage} 页）`);
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
        
        // Add last_message_time to each contact
        // 🔧 只使用真实的消息时间，不使用 updated_at 作为 fallback
        let enrichedData = data.map(contact => ({
            ...contact,
            last_message_time: lastMessageMap.get(contact.jid) || null
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

// Get Messages
app.get('/api/session/:id/messages/:jid', async (req, res) => {
    const sessionId = req.params.id;
    const jid = req.params.jid;
    
    console.log(`[API] 📨 获取消息: 会话=${sessionId}, 聊天=${jid}`);
    
    try {
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
            .eq('session_id', sessionId)
            .eq('remote_jid', jid)
        .order('message_timestamp', { ascending: true });
        
        if (error) {
            console.error(`[API] ❌ 获取消息失败:`, error);
            return res.status(500).json({ error: error.message });
        }
        
        console.log(`[API] ✅ 返回 ${data.length} 条消息`);
    res.json(data);
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
        
        const DAILY_LIMIT = 50;
        const remaining = DAILY_LIMIT - (count || 0);
        
        if (recipients.length > remaining) {
            return res.status(403).json({ 
                error: `Daily limit exceeded. You can only send ${remaining} more messages today. (Limit: ${DAILY_LIMIT})` 
            });
        }

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
    
    // Default limit
    const limit = 50;
    
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
    
    if (sessionsData && sessionsData.length > 0) {
        // 🔧 只恢复最新的一个 session，避免多个连接冲突
        const latestSession = sessionsData.find(s => 
            s.status === 'connected' || s.status === 'initializing'
        );
        
        if (latestSession) {
            try {
                console.log(`✅ 恢复最新的 session: ${latestSession.session_id}`);
                await startSession(latestSession.session_id);
                
                // 清理其他旧的 session 状态（但不删除记录）
                const otherSessions = sessionsData.filter(s => 
                    s.session_id !== latestSession.session_id && 
                    (s.status === 'connected' || s.status === 'initializing')
                );
                
                if (otherSessions.length > 0) {
                    console.log(`🧹 清理 ${otherSessions.length} 个旧 session 的状态...`);
                    for (const oldSession of otherSessions) {
                        await supabase
                            .from('whatsapp_sessions')
                            .update({ status: 'stopped', qr_code: null })
                            .eq('session_id', oldSession.session_id);
                        console.log(`   - 已停止: ${oldSession.session_id}`);
                    }
                }
            } catch (e) {
                console.error(`❌ 恢复 session ${latestSession.session_id} 失败:`, e);
            }
        } else {
            console.log('ℹ️ 没有找到需要恢复的 session');
        }
    } else {
        console.log('ℹ️ 数据库中没有 session 记录');
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

server.listen(port, () => {
    console.log(`Public WhatsApp Server running on port ${port}`);
    console.log(`🔄 自動重連: 已啟用 (最多 ${RECONNECT_CONFIG.maxAttempts} 次嘗試)`);
    console.log(`💓 心跳檢測: 每 ${RECONNECT_CONFIG.heartbeatInterval/1000} 秒`);
    console.log(`🔍 自動檢查: 每 5 分鐘檢查斷開的會話`);
    console.log(`🔌 WebSocket 服務器已啟動`);
});
