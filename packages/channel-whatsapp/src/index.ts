/**
 * LifeOS Channel: WhatsApp Bot
 *
 * Express server with Baileys WebSocket connection.
 * Endpoints:
 * - GET  /health     — health check
 * - POST /reminders  — check upcoming events & send alerts
 *
 * WhatsApp connection:
 * - Uses @whiskeysockets/baileys for WhatsApp Web protocol
 * - Auth state persisted to GCS bucket (survives redeploys)
 * - First run: prints QR code for pairing
 */

import express from 'express';
import 'dotenv/config';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
// @ts-ignore no type declarations
import qrcode from 'qrcode-terminal';
import { loadAuthState, saveAuthState } from './session.js';
import { setSocket, sendTextMessage } from './client.js';
import { getOwnerJid, setOwnerLid } from './security.js';
import { handleMessage } from './handlers/message.js';
import { checkAndNotify } from './services/reminders.js';

// Baileys is very chatty at info level (dumps session keys) — always use warn
const logger = pino({ level: 'warn' });

const app = express();
app.use(express.json());

// Track connection status for health checks
let connectionStatus: 'connecting' | 'open' | 'closed' = 'connecting';

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: connectionStatus === 'open' ? 'ok' : 'degraded',
    channel: 'lifeos-channel-whatsapp',
    connection: connectionStatus,
  });
});

// ─── Send Endpoint ───────────────────────────────────────
// Used by background agents (briefing, sync) to send proactive messages.
// SECURITY: sendTextMessage is locked to owner JID only — even if called
// with an arbitrary number, assertOwnerJid() will throw.
app.post('/send', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }
    // Always send to owner's self-chat — ignore any 'number' param
    const ownerJid = getOwnerJid();
    if (!ownerJid) {
      res.status(500).json({ error: 'WHATSAPP_CHAT_NUMBER not configured' });
      return;
    }
    await sendTextMessage(ownerJid, text);
    res.json({ status: 'ok' });
  } catch (error: any) {
    console.error('[send] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Reminder Endpoint ───────────────────────────────────
// Called by Cloud Scheduler every 15 minutes during waking hours
app.post('/reminders', async (_req, res) => {
  try {
    const result = await checkAndNotify();
    console.log(`[reminders] Checked: ${result.events.length} upcoming, ${result.notified} notified`);
    res.json({ status: 'ok', ...result });
  } catch (error: any) {
    console.error('[reminders] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Baileys Connection ──────────────────────────────────

async function connectWhatsApp(): Promise<void> {
  // Load auth state (from GCS or local)
  const authDir = await loadAuthState();
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger as any,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: undefined,
    markOnlineOnConnect: false,
  });

  setSocket(sock);

  // Debounce timer for GCS session saves
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  // Baileys v7: all events flow through ev.process()
  sock.ev.process(async (events) => {
    // ── Credential updates → save to GCS
    if (events['creds.update']) {
      await saveCreds();
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveAuthState(), 5000);
    }

    // ── Connection updates → QR, open, close
    if (events['connection.update']) {
      const { connection, lastDisconnect, qr } = events['connection.update'];

      if (qr) {
        console.log('[whatsapp] Scan this QR code with WhatsApp (Linked Devices → Link a Device):');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        connectionStatus = 'open';
        console.log('[whatsapp] Connected to WhatsApp');

        // Capture owner's LID (Linked Identity) for self-chat message matching
        const lid = (sock as any).user?.lid;
        if (lid) setOwnerLid(lid);
      }

      if (connection === 'close') {
        connectionStatus = 'closed';
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(
          `[whatsapp] Connection closed (status: ${statusCode}).`,
          shouldReconnect ? 'Reconnecting...' : 'Logged out — restart and re-pair.',
        );

        if (shouldReconnect) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          connectWhatsApp();
        }
      }
    }

    // ── Incoming messages → AI handler
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      if (type !== 'notify') return;

      for (const msg of messages) {
        try {
          await handleMessage(msg, sock);
        } catch (error: any) {
          console.error('[whatsapp] Message handler error:', error.message);
        }
      }
    }
  });
}

// ─── Start ───────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3009', 10);
app.listen(port, () => {
  console.log(`[channel-whatsapp] HTTP server on port ${port}`);
});

connectWhatsApp().catch(error => {
  console.error('[whatsapp] Failed to connect:', error);
});
