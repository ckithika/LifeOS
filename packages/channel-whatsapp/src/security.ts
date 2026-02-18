/**
 * WhatsApp security — self-only messaging
 *
 * The bot runs on your personal WhatsApp number via Baileys.
 * To prevent it from ever messaging your contacts:
 *  1. Only processes messages you send to yourself ("Message yourself" chat)
 *  2. All send functions are locked to your own JID — cannot message anyone else
 *  3. Non-self messages are dropped immediately with zero processing
 */

// Owner's LID (Linked Identity) JID — set after Baileys connects.
// WhatsApp now routes self-chat messages via @lid JIDs instead of @s.whatsapp.net.
let ownerLid: string | null = null;

/**
 * Store the owner's LID after connection (called from index.ts).
 */
export function setOwnerLid(lid: string): void {
  ownerLid = lid;
  console.log(`[security] Owner LID set: ${lid.substring(0, 15)}...`);
}

/**
 * Get the owner's JID for sending messages (always @s.whatsapp.net).
 */
export function getOwnerJid(): string | null {
  const number = process.env.WHATSAPP_CHAT_NUMBER;
  if (!number) return null;
  return `${number}@s.whatsapp.net`;
}

/**
 * Check if a JID belongs to the owner.
 * Matches both @s.whatsapp.net and @lid formats.
 */
export function isOwnerJid(jid: string): boolean {
  // Check @s.whatsapp.net match
  const ownerJid = getOwnerJid();
  if (ownerJid) {
    const normalize = (j: string) => j.split('@')[0].split(':')[0];
    if (normalize(jid) === normalize(ownerJid)) return true;
  }

  // Check @lid match (WhatsApp Linked Identity)
  if (ownerLid && jid.endsWith('@lid')) {
    const normalize = (j: string) => j.split('@')[0].split(':')[0];
    const lidNorm = normalize(ownerLid);
    if (normalize(jid) === lidNorm) return true;
  }

  return false;
}

/**
 * Assert a JID is the owner's — throws if not.
 * Used as a guard in all send functions.
 */
export function assertOwnerJid(jid: string): void {
  if (!isOwnerJid(jid)) {
    throw new Error(`[security] Blocked send to non-owner JID: ${jid.split('@')[0].substring(0, 6)}...`);
  }
}
