/**
 * LifeOS Channel: Telegram Bot
 *
 * Express server with webhook endpoint for grammY bot.
 * Endpoints:
 * - GET  /health     — health check
 * - POST /webhook    — Telegram webhook (grammY)
 * - POST /reminders  — check upcoming events & send alerts
 */

import express from 'express';
import 'dotenv/config';
import { webhookCallback } from 'grammy';
import { loadFromVault } from '@lifeos/channel-shared';
import { createBot } from './bot.js';
import { checkAndNotify } from './services/reminders.js';

const app = express();
app.use(express.json());

// Load conversation memory from vault on cold start
loadFromVault().catch(err => console.warn('[startup] Memory load:', err.message));

// Create bot instance
const bot = createBot();

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', channel: 'lifeos-channel-telegram' });
});

// ─── Telegram Webhook ────────────────────────────────────
// Opus + tool calls can take 30-60s; grammY default is 10s
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
app.post('/webhook', webhookCallback(bot, 'express', {
  secretToken: webhookSecret,
  timeoutMilliseconds: 190_000, // just under Cloud Run's 300s timeout
  onTimeout: 'return',          // respond 200 to Telegram, keep processing
}));

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

// ─── Start Server ────────────────────────────────────────
const port = parseInt(process.env.PORT ?? '3008', 10);
app.listen(port, () => {
  console.log(`[channel-telegram] Listening on port ${port}`);
});
