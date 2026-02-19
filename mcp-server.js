#!/usr/bin/env node
/**
 * WhatsApp API Hub - MCP Server
 *
 * Exposes WhatsApp functionality as MCP tools so that any MCP-compatible
 * AI client (Claude, Cursor, etc.) can interact with WhatsApp sessions.
 *
 * Transport: Streamable HTTP on port 3001 (configurable via MCP_PORT env var).
 * It talks to the REST API Hub (server.js) running on port 3000.
 */

require('dotenv').config();
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const http = require('http');

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'testing';
const MCP_PORT = parseInt(process.env.MCP_PORT, 10) || 3001;

// ─── Helper: call REST API ──────────────────────────────────────────────────

async function api(method, path, body) {
  const url = `${API_BASE}${path}`;
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'whatsapp-api-hub',
  version: '2.0.0'
});

// ── Session tools ───────────────────────────────────────────────────────────

server.tool('list_sessions', 'List all active WhatsApp sessions', {}, async () => {
  const data = await api('GET', '/api/sessions');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('create_session', 'Create and start a new WhatsApp session', {
  sessionId: z.string().optional().describe('Optional custom session ID')
}, async ({ sessionId }) => {
  const data = await api('POST', '/api/sessions', sessionId ? { id: sessionId } : {});
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_session', 'Get session details including QR code and status', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('GET', `/api/sessions/${sessionId}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_qr_code', 'Get QR code for scanning (base64 data URL)', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/qr`);
  if (data.qr) {
    return { content: [
      { type: 'text', text: 'QR code is available. Show the data URL below to the user for scanning:' },
      { type: 'text', text: data.qr }
    ]};
  }
  return { content: [{ type: 'text', text: 'No QR code available. Session may already be connected.' }] };
});

server.tool('restart_session', 'Restart a WhatsApp session', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/restart`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('logout_session', 'Logout from WhatsApp session', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/logout`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_session', 'Delete a session and all its local auth data', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('DELETE', `/api/sessions/${sessionId}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Contact tools ───────────────────────────────────────────────────────────

server.tool('list_contacts', 'List contacts for a session', {
  sessionId: z.string().describe('Session ID'),
  type: z.enum(['all', 'group', 'private']).optional().describe('Filter by type'),
  search: z.string().optional().describe('Search by name or JID'),
  limit: z.number().optional().describe('Max results (default 50)'),
  offset: z.number().optional().describe('Offset for pagination')
}, async ({ sessionId, type, search, limit, offset }) => {
  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  if (search) params.set('search', search);
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  const data = await api('GET', `/api/sessions/${sessionId}/contacts${qs ? '?' + qs : ''}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_contact', 'Get details of a specific contact', {
  sessionId: z.string().describe('Session ID'),
  jid: z.string().describe('Contact JID (e.g. 85212345678@s.whatsapp.net)')
}, async ({ sessionId, jid }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/contacts/${encodeURIComponent(jid)}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('update_contact', 'Update contact name or custom name', {
  sessionId: z.string().describe('Session ID'),
  jid: z.string().describe('Contact JID'),
  name: z.string().optional().describe('Contact name'),
  customName: z.string().optional().describe('Custom note name')
}, async ({ sessionId, jid, name, customName }) => {
  const data = await api('PUT', `/api/sessions/${sessionId}/contacts/${encodeURIComponent(jid)}`, { name, customName });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Message tools ───────────────────────────────────────────────────────────

server.tool('get_messages', 'Get messages from a chat', {
  sessionId: z.string().describe('Session ID'),
  chatId: z.string().describe('Chat JID'),
  limit: z.number().optional().describe('Max messages (default 50)'),
  before: z.string().optional().describe('ISO timestamp - get messages before this time'),
  after: z.string().optional().describe('ISO timestamp - get messages after this time')
}, async ({ sessionId, chatId, limit, before, after }) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  if (after) params.set('after', after);
  const qs = params.toString();
  const data = await api('GET', `/api/sessions/${sessionId}/messages/${encodeURIComponent(chatId)}${qs ? '?' + qs : ''}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('send_message', 'Send a text message via WhatsApp', {
  sessionId: z.string().describe('Session ID'),
  to: z.string().describe('Recipient phone number (e.g. 85212345678) or JID'),
  message: z.string().describe('Message text')
}, async ({ sessionId, to, message }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/messages/send`, { to, message });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('revoke_message', 'Revoke (unsend) a message for everyone', {
  sessionId: z.string().describe('Session ID'),
  messageId: z.string().describe('Message ID to revoke'),
  chatId: z.string().describe('Chat JID where the message was sent')
}, async ({ sessionId, messageId, chatId }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/messages/${messageId}/revoke`, { chatId });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('delete_message', 'Delete a message from the database (local only)', {
  sessionId: z.string().describe('Session ID'),
  messageId: z.string().describe('Message ID to delete')
}, async ({ sessionId, messageId }) => {
  const data = await api('DELETE', `/api/sessions/${sessionId}/messages/${messageId}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Group tools ─────────────────────────────────────────────────────────────

server.tool('list_groups', 'List all WhatsApp groups', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/groups`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('get_group_participants', 'Get members of a group', {
  sessionId: z.string().describe('Session ID'),
  groupJid: z.string().describe('Group JID (e.g. 120363...@g.us)')
}, async ({ sessionId, groupJid }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/groups/${encodeURIComponent(groupJid)}/participants`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Chat tools ──────────────────────────────────────────────────────────────

server.tool('list_chats', 'List recent conversations sorted by last activity', {
  sessionId: z.string().describe('Session ID'),
  limit: z.number().optional().describe('Max results (default 50)'),
  offset: z.number().optional().describe('Offset for pagination')
}, async ({ sessionId, limit, offset }) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const qs = params.toString();
  const data = await api('GET', `/api/sessions/${sessionId}/chats${qs ? '?' + qs : ''}`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Broadcast ───────────────────────────────────────────────────────────────

server.tool('broadcast_message', 'Send a message to multiple recipients', {
  sessionId: z.string().describe('Session ID'),
  recipients: z.array(z.string()).describe('Array of phone numbers or JIDs'),
  message: z.string().describe('Message text'),
  delayMs: z.number().optional().describe('Delay between sends in ms (default 1000)')
}, async ({ sessionId, recipients, message, delayMs }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/broadcast`, { recipients, message, delayMs });
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Stats ───────────────────────────────────────────────────────────────────

server.tool('get_stats', 'Get session statistics (contacts, messages, etc.)', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/stats`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── LID Mapping ─────────────────────────────────────────────────────────────

server.tool('list_lid_mappings', 'List all LID-to-JID mappings', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('GET', `/api/sessions/${sessionId}/lid-mappings`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

server.tool('auto_map_lids', 'Automatically discover LID-to-JID mappings by name matching', {
  sessionId: z.string().describe('Session ID')
}, async ({ sessionId }) => {
  const data = await api('POST', `/api/sessions/${sessionId}/lid-mappings/auto`);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Health ───────────────────────────────────────────────────────────────────

server.tool('health_check', 'Check if the WhatsApp API Hub is running', {}, async () => {
  const data = await api('GET', '/api/health');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

// ── Resources (read-only data the AI model can inspect) ─────────────────────

server.resource('api-docs', 'whatsapp://api-docs', async (uri) => {
  const docs = `# WhatsApp API Hub - Available Tools

## Session Management
- list_sessions: See all active WhatsApp sessions
- create_session: Start a new session (will generate QR for scanning)
- get_session: Get session status and details
- get_qr_code: Get QR code for phone scanning
- restart_session: Restart a session
- logout_session: Logout from WhatsApp
- delete_session: Remove session completely

## Messaging
- send_message: Send text message to a phone number or JID
- get_messages: Read message history from a chat
- revoke_message: Unsend a message for everyone
- delete_message: Delete message from database
- broadcast_message: Send to multiple recipients

## Contacts
- list_contacts: List all contacts (filterable by type/search)
- get_contact: Get specific contact info
- update_contact: Update contact name

## Groups
- list_groups: List all groups
- get_group_participants: Get group members

## Chats
- list_chats: List recent conversations

## LID Mapping
- list_lid_mappings: View JID mappings
- auto_map_lids: Auto-discover mappings

## Stats
- get_stats: Session statistics

## JID Format
- Private chats: 852XXXXXXXX@s.whatsapp.net
- Groups: 120363XXXXXXXXXX@g.us
- LID contacts: XXXXXXXXXXXXX@lid
`;
  return { contents: [{ uri: uri.href, text: docs, mimeType: 'text/markdown' }] };
});

// ─── Start MCP Server ───────────────────────────────────────────────────────

async function main() {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  const httpServer = http.createServer(async (req, res) => {
    if (req.url === '/mcp' || req.url.startsWith('/mcp?')) {
      await transport.handleRequest(req, res);
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'whatsapp-mcp-server' }));
    } else {
      res.writeHead(404);
      res.end('Not found. Use /mcp for MCP protocol or /health for status.');
    }
  });

  await server.connect(transport);

  httpServer.listen(MCP_PORT, () => {
    console.log(`WhatsApp MCP Server running on port ${MCP_PORT}`);
    console.log(`MCP endpoint: http://localhost:${MCP_PORT}/mcp`);
    console.log(`Health check: http://localhost:${MCP_PORT}/health`);
  });
}

main().catch(err => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
