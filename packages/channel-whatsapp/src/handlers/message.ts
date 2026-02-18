/**
 * Incoming WhatsApp message handler → AI conversation
 *
 * SECURITY: Only processes messages you send to yourself
 * ("Message yourself" / self-chat). All other messages are
 * dropped immediately — no text extraction, no logging, no response.
 */

import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { chat } from '@lifeos/channel-shared';
import { isOwnerJid, getOwnerJid } from '../security.js';
import { sendTextMessage, isBotMessage } from '../client.js';

/**
 * Extract text from a WhatsApp message, unwrapping container types.
 * Messages can be nested inside ephemeral, viewOnce, or other wrappers.
 */
function extractText(msg: WAMessage): string {
  let m = msg.message;
  if (!m) return '';

  // Unwrap container types (disappearing messages, view-once, etc.)
  const inner = m.ephemeralMessage?.message
    ?? m.viewOnceMessage?.message
    ?? (m as any).viewOnceMessageV2?.message
    ?? (m as any).documentWithCaptionMessage?.message
    ?? m;

  return inner.conversation
    || inner.extendedTextMessage?.text
    || inner.imageMessage?.caption
    || inner.videoMessage?.caption
    || inner.documentMessage?.caption
    || '';
}

// Keyword shortcuts for common commands
const KEYWORD_SHORTCUTS: Record<string, string> = {
  briefing: 'Generate my daily briefing',
  schedule: "What's on my calendar today?",
  tasks: 'Show my active tasks',
  projects: 'List my active projects',
};

/**
 * Handle an incoming WhatsApp message.
 * Only processes self-messages (messages you send to your own "Message yourself" chat).
 */
export async function handleMessage(msg: WAMessage, sock: WASocket): Promise<void> {
  const jid = msg.key.remoteJid;

  // ── Gate 1: Only individual chats (no groups, no status broadcasts)
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  // ── Gate 2: Only self-chat (jid matches owner's number)
  if (!isOwnerJid(jid)) return;

  // ── Gate 3: Skip messages this bot sent (avoid echo loops)
  // In self-chat all messages have fromMe=true, so we track sent IDs instead.
  if (msg.key.id && isBotMessage(msg.key.id)) return;

  // ── Now safe to extract content (this is your own self-chat message)
  const text = extractText(msg);

  if (!text.trim()) {
    console.log(`[message] Empty text, skipping (type: ${Object.keys(msg.message ?? {})})`);
    return;
  }

  const ownerJid = getOwnerJid();
  if (!ownerJid) return;

  console.log(`[message] Self-chat: "${text.substring(0, 50)}"`);

  try {
    // Check keyword shortcuts
    const lowerText = text.trim().toLowerCase();
    const expandedText = KEYWORD_SHORTCUTS[lowerText] || text;

    console.log(`[message] Calling AI for: "${expandedText.substring(0, 50)}"`);

    // Call AI orchestrator
    const response = await chat(expandedText, {
      chatId: ownerJid,
      channelName: 'WhatsApp',
    });

    console.log(`[message] AI responded (${response.length} chars)`);
    await sendTextMessage(ownerJid, response);
  } catch (error: any) {
    console.error('[message] AI error:', error.message);
    await sendTextMessage(ownerJid, `Error: ${error.message}`);
  }
}
