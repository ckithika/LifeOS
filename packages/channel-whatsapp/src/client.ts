/**
 * WhatsApp send wrappers using Baileys socket.
 *
 * SECURITY: All send functions are locked to the owner's JID only.
 * The bot cannot message anyone other than the owner, even if called
 * with an arbitrary JID — assertOwnerJid() will throw.
 */

import type { WASocket } from '@whiskeysockets/baileys';
import { toWhatsAppFormat, truncateForWhatsApp } from './formatting.js';
import { assertOwnerJid } from './security.js';

let sock: WASocket | null = null;

// Track message IDs sent by this bot to avoid processing our own echoes
const sentMessageIds = new Set<string>();
const MAX_TRACKED_IDS = 200;

/** Check if a message was sent by this bot instance. */
export function isBotMessage(id: string): boolean {
  return sentMessageIds.has(id);
}

function trackSentMessage(id: string): void {
  sentMessageIds.add(id);
  // Prune old entries to avoid unbounded growth
  if (sentMessageIds.size > MAX_TRACKED_IDS) {
    const first = sentMessageIds.values().next().value;
    if (first) sentMessageIds.delete(first);
  }
}

/**
 * Set the Baileys socket reference (called from index.ts after connection).
 */
export function setSocket(socket: WASocket): void {
  sock = socket;
}

/**
 * Get the current socket (null if not connected).
 */
export function getSocket(): WASocket | null {
  return sock;
}

/**
 * Send a text message with WhatsApp formatting.
 * Locked to owner JID only.
 */
export async function sendTextMessage(jid: string, text: string): Promise<void> {
  assertOwnerJid(jid);

  if (!sock) {
    console.warn('[client] Socket not connected, cannot send message');
    return;
  }

  const formatted = toWhatsAppFormat(text);
  const truncated = truncateForWhatsApp(formatted);

  const sent = await sock.sendMessage(jid, { text: truncated });
  if (sent?.key?.id) trackSentMessage(sent.key.id);
}

/**
 * Send a button message (limited WhatsApp support — falls back to numbered list).
 * Locked to owner JID only.
 */
export async function sendButtonMessage(
  jid: string,
  text: string,
  buttons: Array<{ id: string; label: string }>,
): Promise<void> {
  assertOwnerJid(jid);

  if (!sock) {
    console.warn('[client] Socket not connected, cannot send message');
    return;
  }

  // WhatsApp buttons have limited support — use numbered list as fallback
  const buttonList = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
  const fullText = `${toWhatsAppFormat(text)}\n\n${buttonList}`;

  const sent = await sock.sendMessage(jid, { text: truncateForWhatsApp(fullText) });
  if (sent?.key?.id) trackSentMessage(sent.key.id);
}
