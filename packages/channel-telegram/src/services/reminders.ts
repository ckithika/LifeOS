/**
 * Meeting reminder service — one notification per meeting
 *
 * Checks upcoming calendar events (next 15 min) and sends a single
 * consolidated Telegram alert with time, attendees, meet link, and vault context.
 * Replaces the old separate reminder + meeting-prep dual notification.
 */

import {
  getAllAccountClients,
  findContact,
  searchVault,
  sendTelegramMessage,
  isVaultConfigured,
  formatTime,
} from '@lifeos/shared';
import type { ReminderCheck, UpcomingEvent } from '../types.js';

const REMINDER_WINDOW_MINUTES = 15;

/** Skip events starting in < 2 min to reduce cold-start re-notification risk */
const MIN_MINUTES = 2;

/** Cache of already-notified events: "eventId|startTime" → timestamp sent */
const notifiedCache = new Map<string, number>();

function evictStaleEntries(): void {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [key, sentAt] of notifiedCache) {
    if (sentAt < cutoff) notifiedCache.delete(key);
  }
}

export async function checkAndNotify(): Promise<ReminderCheck> {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return { events: [], notified: 0 };

  evictStaleEntries();

  const upcoming = await getUpcomingEvents();
  let notified = 0;

  for (const event of upcoming) {
    if (event.minutesUntil < MIN_MINUTES) continue;

    const cacheKey = `${event.id}|${event.start}`;
    if (notifiedCache.has(cacheKey)) continue;

    const text = await buildNotification(event);
    const sent = await sendTelegramMessage(chatId, text.slice(0, 4000), { parse_mode: 'HTML' });
    if (sent) {
      notifiedCache.set(cacheKey, Date.now());
      notified++;
    }
  }

  return { events: upcoming, notified };
}

// ─── Fetch upcoming events with full details ────────────

async function getUpcomingEvents(): Promise<UpcomingEvent[]> {
  const events: UpcomingEvent[] = [];
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60 * 1000);

  let allClients: Map<string, any>;
  try {
    allClients = getAllAccountClients();
  } catch {
    return events;
  }

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: windowEnd.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      for (const event of response.data.items ?? []) {
        const start = event.start?.dateTime;
        if (!start) continue;

        const startTime = new Date(start);
        const minutesUntil = Math.round((startTime.getTime() - now.getTime()) / 60000);

        // Extract Google Meet URL
        const meetUrl = event.hangoutLink
          || extractMeetUrl(event.location)
          || undefined;

        // Extract attendees (exclude self)
        const attendees = (event.attendees ?? [])
          .filter((a: any) => !a.self)
          .map((a: any) => ({
            name: a.displayName || a.email?.split('@')[0] || 'Unknown',
            email: a.email || '',
          }));

        events.push({
          id: event.id ?? `${alias}-${start}`,
          summary: event.summary ?? '(No title)',
          start,
          minutesUntil,
          account: alias,
          location: event.location ?? undefined,
          meetUrl,
          htmlLink: event.htmlLink ?? undefined,
          attendees,
        });
      }
    } catch (error: any) {
      console.warn(`[reminders] Calendar error for ${alias}:`, error.message);
    }
  }

  return events;
}

function extractMeetUrl(location?: string): string | undefined {
  if (!location) return undefined;
  const match = location.match(/https:\/\/meet\.google\.com\/[a-z\-]+/i);
  return match?.[0];
}

// ─── Build consolidated notification ────────────────────

async function buildNotification(event: UpcomingEvent): Promise<string> {
  const time = formatTime(new Date(event.start));

  const sections: string[] = [];

  // Header
  sections.push(`<b>${event.summary}</b> — ${time} (in ${event.minutesUntil} min)`);

  // Location / Meet link
  if (event.meetUrl) {
    sections.push(`<a href="${event.meetUrl}">Join Google Meet</a>`);
  } else if (event.location) {
    sections.push(event.location);
  }

  // Attendees with contact lookup
  if (event.attendees.length > 0) {
    const lines: string[] = [];
    for (const att of event.attendees.slice(0, 5)) {
      let line = `  - <b>${att.name}</b> (${att.email})`;
      try {
        const contacts = await findContact(att.name, 1);
        if (contacts.length > 0 && contacts[0].organization) {
          line += ` — ${contacts[0].organization}`;
        }
      } catch {
        // best-effort
      }
      lines.push(line);
    }
    if (event.attendees.length > 5) {
      lines.push(`  - <i>+${event.attendees.length - 5} more</i>`);
    }
    sections.push(`<b>Attendees:</b>\n${lines.join('\n')}`);
  }

  // Vault context
  if (isVaultConfigured()) {
    try {
      const results = await searchVault(event.summary);
      if (results.length > 0) {
        sections.push(
          '<b>Related notes:</b>\n' +
          results.slice(0, 3).map(r => `  - ${r.path}`).join('\n'),
        );
      }
    } catch {
      // best-effort
    }
  }

  return sections.join('\n\n');
}
