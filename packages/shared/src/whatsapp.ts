/**
 * LifeOS — Shared WhatsApp Utilities
 *
 * Simple HTTP wrappers for sending proactive WhatsApp messages
 * via the channel-whatsapp Cloud Run service.
 * Graceful no-op if WHATSAPP_SERVICE_URL is not set.
 *
 * SECURITY: The /send endpoint on channel-whatsapp always sends to the
 * owner's self-chat only. No number parameter is needed or accepted.
 */

const SERVICE_URL = () => process.env.WHATSAPP_SERVICE_URL;

/**
 * Send a text message via the WhatsApp channel service.
 * Always delivers to the owner's self-chat (configured on the channel service).
 * No-ops if WHATSAPP_SERVICE_URL is not set.
 */
export async function sendWhatsAppMessage(text: string): Promise<boolean> {
  const url = SERVICE_URL();
  if (!url) return false;

  try {
    const response = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[whatsapp] sendMessage failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[whatsapp] sendMessage error:', error);
    return false;
  }
}
