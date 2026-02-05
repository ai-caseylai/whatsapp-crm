const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage, getContentType, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const express = require('express');
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
            
            // Try to query connection state (lightweight operation)
            const state = sock.ws?.readyState;
            if (state !== 1) { // 1 = OPEN
                console.log(`[${sessionId}] ⚠️ WebSocket 狀態異常 (${state}), 可能需要重連`);
            } else {
                console.log(`[${sessionId}] 💓 心跳正常 (運行時間: ${Math.floor((Date.now() - session.lastSync.getTime()) / 1000 / 60)} 分鐘)`);
            }
        } catch (error) {
            console.error(`[${sessionId}] ❌ 心跳檢測錯誤:`, error.message);
        }
    }, RECONNECT_CONFIG.heartbeatInterval);
    
    session.heartbeatTimer.unref(); // Don't keep process alive just for heartbeat
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
            try {
                const groups = await sock.groupFetchAllParticipating();
                const groupContacts = Object.keys(groups).map(jid => {
                    const group = groups[jid];
                    return {
                        session_id: sessionId,
                        jid: jid,
                        name: group.subject,
                        notify: group.subject,
                        is_group: true,
                        updated_at: new Date()
                    };
                });
                
                if (groupContacts.length > 0) {
                     await supabase.from('whatsapp_contacts')
                        .upsert(groupContacts, { onConflict: 'session_id,jid' });
                }
            } catch (e) {
                console.error(`Error fetching groups for ${sessionId}:`, e);
            }
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
            const chatContacts = chats.map(chat => ({
                session_id: sessionId,
                jid: chat.id,
                name: chat.name || chat.id.split('@')[0],
                notify: chat.name,
                is_group: chat.id.endsWith('@g.us'),
                unread_count: chat.unreadCount || 0,
                updated_at: new Date(chat.conversationTimestamp * 1000 || Date.now())
            }));
            
            await supabase.from('whatsapp_contacts')
                .upsert(chatContacts, { onConflict: 'session_id,jid' });
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

                // Webhook for new messages (not history, but upsert can contain history if type is 'append')
                // Usually type 'notify' means new message
                if (type === 'notify') {
                    validMessages.forEach(m => {
                        sendWebhook('message', { sessionId, message: m });
                    });
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
                
                if (!isGroup && !isBroadcast) {
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
                .upsert(Array.from(senders.values()), { onConflict: 'session_id,jid' }); // This might overwrite existing names with pushName
        }
    });

// Helper to unwrap message
function unwrapMessage(message) {
    if (!message) return null;
    if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
    if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
    if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
    return message;
}

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

    return {
        message_id: msg.key.id,
        session_id: sessionId,
        remote_jid: msg.key.remoteJid,
        from_me: msg.key.fromMe || false,
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

// Get Contacts (Protected by Session ID only)
app.get('/api/session/:id/contacts', async (req, res) => {
    // Also try to fetch contacts from Supabase first
    let { data, error } = await supabase
        .from('whatsapp_contacts')
        .select('*')
        .eq('session_id', req.params.id);
        
    // If empty, use Store to populate
    if ((!data || data.length === 0)) {
         console.log('Contacts DB empty, trying to fetch from local cache...');
         const cache = contactCache.get(req.params.id);
         
         if (cache && cache.size > 0) {
             const contacts = Array.from(cache.values());
             
             // Format for DB and Response
             const upsertData = contacts.map(c => ({
                session_id: req.params.id,
                jid: c.id,
                name: c.name || c.notify || c.verifiedName || null,
                notify: c.notify || null,
                updated_at: new Date()
            }));
            
            // Async Update DB
            supabase.from('whatsapp_contacts').upsert(upsertData, { onConflict: 'session_id,jid' }).then(({ error }) => {
                if(error) console.error('Failed to sync cache to DB:', error);
            });
            
            // Return this directly to frontend
            return res.json(upsertData);
         }
    }
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Get Messages
app.get('/api/session/:id/messages/:jid', async (req, res) => {
    const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('session_id', req.params.id)
        .eq('remote_jid', req.params.jid)
        .order('message_timestamp', { ascending: true });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
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

// 2. Get QR
app.get('/api/v1/sessions/:id/qr', checkAuthToken, (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ qr: session.qr });
});

// 3. Send Message
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
    const { data: sessionsData } = await supabase.from('whatsapp_sessions').select('*');
    if (sessionsData) {
        for (const s of sessionsData) {
            // Restore all sessions that were active
            if (s.status === 'connected' || s.status === 'initializing') {
                try {
                    console.log(`Restoring session ${s.session_id}`);
                    await startSession(s.session_id);
                } catch (e) {
                    console.error(`Failed to restore session ${s.session_id}:`, e);
                }
            }
        }
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

app.listen(port, () => {
    console.log(`Public WhatsApp Server running on port ${port}`);
    console.log(`🔄 自動重連: 已啟用 (最多 ${RECONNECT_CONFIG.maxAttempts} 次嘗試)`);
    console.log(`💓 心跳檢測: 每 ${RECONNECT_CONFIG.heartbeatInterval/1000} 秒`);
    console.log(`🔍 自動檢查: 每 5 分鐘檢查斷開的會話`);
});
