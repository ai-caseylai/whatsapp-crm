const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");
const MESSAGES_DIR = path.join(DATA_DIR, "messages");
if (!fs.existsSync(MESSAGES_DIR)) {
    fs.mkdirSync(MESSAGES_DIR);
}

// In-memory contacts cache
let globalContacts = {};

// Load existing contacts
if (fs.existsSync(CONTACTS_FILE)) {
    try {
        globalContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, "utf8"));
    } catch (e) {
        console.error("Error reading contacts file:", e);
    }
}

// Helper to save contacts safely
function saveContacts(newContacts) {
    let updated = false;
    const contactsList = Array.isArray(newContacts) ? newContacts : Object.values(newContacts);
    
    for (const contact of contactsList) {
        const id = contact.id;
        if (!id) continue;
        
        // Update if new or name changed
        if (!globalContacts[id] || (contact.name && contact.name !== globalContacts[id].name)) {
            globalContacts[id] = {
                ...globalContacts[id],
                ...contact,
                lastSeen: new Date().toISOString()
            };
            updated = true;
        }
    }
    
    if (updated) {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(globalContacts, null, 2));
        console.log(`Saved ${contactsList.length} updated contacts to file.`);
    }
}

// Helper to save messages
function saveMessage(msg) {
    const remoteJid = msg.key.remoteJid;
    const safeJid = remoteJid.replace(/[^a-zA-Z0-9@.-]/g, "_");
    const chatFile = path.join(MESSAGES_DIR, `${safeJid}.json`);
    
    let messages = [];
    if (fs.existsSync(chatFile)) {
        try {
            messages = JSON.parse(fs.readFileSync(chatFile, "utf8"));
        } catch (e) {
            console.error(`Error reading chat file ${chatFile}:`, e);
        }
    }
    
    const content = msg.message?.conversation || 
                   msg.message?.extendedTextMessage?.text || 
                   msg.message?.imageMessage?.caption || 
                   "[Media/Other]";
                   
    const messageData = {
        key: msg.key,
        timestamp: msg.messageTimestamp,
        pushName: msg.pushName,
        fromMe: msg.key.fromMe,
        content: content,
        fullMessage: msg.message
    };
    
    messages.push(messageData);
    fs.writeFileSync(chatFile, JSON.stringify(messages, null, 2));
    console.log(`Saved message from ${msg.pushName || remoteJid} to ${safeJid}.json`);
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        generateHighQualityLinkPreview: true,
        syncFullHistory: true
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("\n\n=== QR CODE START ===");
            qrcode.generate(qr, { small: true });
            console.log("=== QR CODE END ===\n\n");
        }
        
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("connection closed due to ", lastDisconnect.error, ", reconnecting ", shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === "open") {
            console.log("opened connection");
        }
    });

    // Listen for contacts update directly
    sock.ev.on("contacts.upsert", (contacts) => {
        console.log(`\n--- Received ${contacts.length} contacts ---`);
        saveContacts(contacts);
    });
    
    // Listen for messages
    sock.ev.on("messages.upsert", async m => {
        console.log(`\n=== Received ${m.messages.length} messages (type: ${m.type}) ===`);
        for (const msg of m.messages) {
            if (!msg.message) continue;
            saveMessage(msg);
            
            // Also try to capture contact info from message sender
            if (msg.key.remoteJid && msg.pushName) {
                saveContacts([{
                    id: msg.key.remoteJid,
                    notify: msg.pushName,
                    name: msg.pushName // Use pushName as name if available
                }]);
            }
        }
    });
}

connectToWhatsApp();
