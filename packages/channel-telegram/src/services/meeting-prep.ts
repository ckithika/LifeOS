/**
 * Meeting prep service — context briefings before meetings
 *
 * 30 minutes before meetings with attendees, sends prep with:
 * - Attendee contact info
 * - Recent emails with attendees
 * - Relevant vault notes
 */

import {
  getAllAccountClients,
  findContact,
  searchVault,
  sendTelegramMessage,
} from '@lifeos/shared';

/** In-memory dedup cache (resets on cold start — acceptable for Cloud Run) */
const prepSentCache = new Set<string>();

/**
 * Check upcoming meetings and send prep for those starting in ~30 min.
 * Returns the number of preps sent.
 */
export async function prepUpcomingMeetings(): Promise<number> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return 0;

  const now = new Date();
  const windowStart = new Date(now.getTime() + 25 * 60 * 1000); // 25 min
  const windowEnd = new Date(now.getTime() + 35 * 60 * 1000);   // 35 min

  let allClients: Map<string, any>;
  try {
    allClients = getAllAccountClients();
  } catch {
    return 0;
  }

  let sent = 0;

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: windowStart.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      for (const event of response.data.items ?? []) {
        const eventId = event.id;
        if (!eventId || prepSentCache.has(eventId)) continue;

        const attendees = (event.attendees ?? []).filter((a: any) => !a.self);
        if (attendees.length === 0) continue; // Skip meetings with no external attendees

        const startTime = new Date(event.start?.dateTime || event.start?.date || '');
        const time = startTime.toLocaleTimeString('en-KE', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Nairobi',
        });

        // Gather context for each attendee
        const attendeeLines: string[] = [];
        for (const att of attendees.slice(0, 5)) { // Limit to 5 attendees
          const name = att.displayName || att.email?.split('@')[0] || 'Unknown';
          const email = att.email || '';
          let info = `  - <b>${name}</b> (${email})`;

          try {
            const contacts = await findContact(name, 1);
            if (contacts.length > 0 && contacts[0].organization) {
              info += ` — ${contacts[0].organization}`;
            }
          } catch {
            // Contact lookup is best-effort
          }

          attendeeLines.push(info);
        }

        // Search vault for meeting context
        const title = event.summary || '';
        let vaultContext = '';
        try {
          const results = await searchVault(title);
          if (results.length > 0) {
            vaultContext = '\n\n<b>Related notes:</b>\n' +
              results.slice(0, 3).map(r => `  - ${r.path}`).join('\n');
          }
        } catch {
          // Vault search is best-effort
        }

        const message = [
          `<b>Meeting Prep</b>`,
          `<b>${title}</b> at ${time}`,
          '',
          '<b>Attendees:</b>',
          ...attendeeLines,
          vaultContext,
        ].filter(Boolean).join('\n');

        await sendTelegramMessage(chatId, message.slice(0, 4000), { parse_mode: 'HTML' });
        prepSentCache.add(eventId);
        sent++;
      }
    } catch (error: any) {
      console.warn(`[meeting-prep] Error for ${alias}:`, error.message);
    }
  }

  return sent;
}
