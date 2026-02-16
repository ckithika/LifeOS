/**
 * LifeOS — Shared Telegram Utilities
 *
 * Simple Telegram Bot API wrappers for sending messages/documents.
 * Graceful no-op if TELEGRAM_BOT_TOKEN is not set, so agents
 * that import this won't break in environments without Telegram.
 */

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;

interface SendMessageOptions {
  parse_mode?: 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  reply_markup?: unknown;
}

/**
 * Send a text message via Telegram Bot API.
 * No-ops if TELEGRAM_BOT_TOKEN is not set.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  options?: SendMessageOptions
): Promise<boolean> {
  const token = BOT_TOKEN();
  if (!token) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode,
        disable_web_page_preview: options?.disable_web_page_preview,
        reply_markup: options?.reply_markup,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[telegram] sendMessage failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram] sendMessage error:', error);
    return false;
  }
}

/**
 * Send a document (file) via Telegram Bot API.
 * No-ops if TELEGRAM_BOT_TOKEN is not set.
 */
export async function sendTelegramDocument(
  chatId: string | number,
  document: Buffer | string,
  filename: string,
  caption?: string
): Promise<boolean> {
  const token = BOT_TOKEN();
  if (!token) return false;

  try {
    const formData = new FormData();
    formData.append('chat_id', String(chatId));

    if (typeof document === 'string') {
      // URL string — pass directly
      formData.append('document', document);
    } else {
      // Buffer — create a Blob
      const blob = new Blob([document]);
      formData.append('document', blob, filename);
    }

    if (caption) formData.append('caption', caption);

    const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[telegram] sendDocument failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram] sendDocument error:', error);
    return false;
  }
}
