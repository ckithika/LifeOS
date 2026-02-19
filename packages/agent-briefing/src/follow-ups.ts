/**
 * Smart follow-up detection and nudges
 *
 * Finds sent emails older than 3 days with no reply,
 * then sends mid-day Telegram nudges.
 */

import { sendTelegramMessage } from '@lifeos/shared';
import type { FollowUpItem } from '@lifeos/shared';

type GoogleClients = {
  gmail: any;
  calendar: any;
  tasks: any;
  drive: any;
  people: any;
};

/**
 * Detect unanswered sent emails across all accounts.
 */
export async function detectFollowUps(
  alias: string,
  clients: GoogleClients,
): Promise<FollowUpItem[]> {
  const followUps: FollowUpItem[] = [];

  try {
    const response = await clients.gmail.users.messages.list({
      userId: 'me',
      q: 'in:sent older_than:3d -has:userlabels',
      maxResults: 5,
    });

    for (const msg of response.data.messages ?? []) {
      if (!msg.id || !msg.threadId) continue;

      try {
        const thread = await clients.gmail.users.threads.get({
          userId: 'me',
          id: msg.threadId,
          format: 'minimal',
        });

        // If thread has only 1 message (the sent one), it's unanswered
        if ((thread.data.messages?.length ?? 0) <= 1) {
          const detail = await clients.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['To', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h: any) => h.name === name)?.value ?? '';

          followUps.push({
            subject: getHeader('Subject'),
            to: getHeader('To'),
            sentDate: getHeader('Date'),
            account: alias,
            threadId: msg.threadId,
          });
        }
      } catch {
        // Skip individual thread errors
      }
    }
  } catch (error: any) {
    console.warn(`[follow-ups] Error for ${alias}:`, error.message);
  }

  return followUps;
}

/**
 * Send follow-up nudges via Telegram.
 */
export async function sendFollowUpNudges(followUps: FollowUpItem[]): Promise<void> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || followUps.length === 0) return;

  const lines = followUps.map((fu) => {
    const threadIdShort = fu.threadId.slice(0, 8);
    return `- <b>${fu.subject}</b>\n  To: ${fu.to} (${fu.account})\n  <i>Sent: ${fu.sentDate}</i>`;
  });

  const message = [
    '<b>Follow-up Nudge</b>',
    '',
    `${followUps.length} sent email(s) with no reply:`,
    '',
    ...lines,
  ].join('\n');

  await sendTelegramMessage(chatId, message.slice(0, 4000), { parse_mode: 'HTML' });
}
