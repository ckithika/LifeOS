/**
 * Calendar Tools — List, Create, FreeBusy
 *
 * Supports multi-account with project-based routing for invite creation.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getAccounts,
  getGoogleClients,
  getCalendarAccount,
  getAccount,
  CalendarEvent,
} from '@lifeos/shared';

export function registerCalendarTools(server: McpServer) {

  // ─── calendar_list ──────────────────────────────────────────

  server.tool(
    'calendar_list',
    'List calendar events across all accounts for a date range. Returns events from all connected calendars.',
    {
      timeMin: z.string().describe('Start of range (ISO 8601, e.g., "2026-02-15T00:00:00Z")'),
      timeMax: z.string().describe('End of range (ISO 8601)'),
      account: z.string().optional().describe('Account alias (omit to search all)'),
      query: z.string().optional().describe('Free-text search within events'),
      maxResults: z.number().default(25).describe('Max results per account'),
    },
    async ({ timeMin, timeMax, account, query, maxResults }) => {
      try {
        const accounts = account
          ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
          : getAccounts();

        const allEvents: CalendarEvent[] = [];

        for (const acct of accounts) {
          if (!acct) continue;
          try {
            const clients = getGoogleClients(acct.alias);
            const response = await clients.calendar.events.list({
              calendarId: 'primary',
              timeMin,
              timeMax,
              maxResults,
              singleEvents: true,
              orderBy: 'startTime',
              q: query,
            });

            for (const event of response.data.items || []) {
              allEvents.push({
                id: event.id || '',
                account: acct.alias,
                calendarId: 'primary',
                summary: event.summary || '(No title)',
                description: event.description ?? undefined,
                start: event.start?.dateTime || event.start?.date || '',
                end: event.end?.dateTime || event.end?.date || '',
                attendees: event.attendees?.map(a => ({
                  email: a.email || '',
                  displayName: a.displayName ?? undefined,
                  responseStatus: a.responseStatus ?? undefined,
                  self: a.self ?? undefined,
                })),
                location: event.location ?? undefined,
                status: event.status || '',
                htmlLink: event.htmlLink ?? undefined,
              });
            }
          } catch (error) {
            allEvents.push({
              id: 'error',
              account: acct.alias,
              calendarId: 'primary',
              summary: `Error: ${error instanceof Error ? error.message : 'unknown'}`,
              start: '',
              end: '',
              status: 'error',
            });
          }
        }

        // Sort by start time
        allEvents.sort((a, b) => a.start.localeCompare(b.start));

        if (allEvents.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No events found in the specified range.' }] };
        }

        const formatted = allEvents.map(e => {
          if (e.id === 'error') return `Error: ${e.account}: ${e.summary}`;

          const time = e.start.includes('T')
            ? `${e.start.slice(11, 16)}–${e.end.slice(11, 16)}`
            : 'All day';
          const attendeeCount = e.attendees?.length || 0;

          return [
            `**${e.summary}** (${e.account})`,
            `  ${time} ${e.location ? `@ ${e.location}` : ''}`,
            attendeeCount > 0 ? `  ${attendeeCount} attendees` : '',
          ].filter(Boolean).join('\n');
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text: `${allEvents.length} events:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `calendar_list failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── calendar_create ────────────────────────────────────────

  // @ts-expect-error TS2589: MCP SDK server.tool() deep type instantiation
  server.tool(
    'calendar_create',
    'Create a calendar event with optional attendees. Routes to the correct account based on project.',
    {
      summary: z.string().describe('Event title'),
      start: z.string().describe('Start time (ISO 8601 with timezone)'),
      end: z.string().describe('End time (ISO 8601 with timezone)'),
      description: z.string().optional().describe('Event description/agenda'),
      location: z.string().optional().describe('Event location or video call link'),
      attendees: z.array(z.string()).optional().describe('Attendee email addresses'),
      account: z.string().optional().describe('Account alias (auto-routed if omitted)'),
      project: z.string().optional().describe('Project slug for auto-routing'),
      sendUpdates: z.enum(['all', 'externalOnly', 'none']).default('all').describe('Who to notify'),
    },
    async ({ summary, start, end, description, location, attendees, account, project, sendUpdates }) => {
      try {
        const accountAlias = account || (project ? getCalendarAccount(project) : getAccounts()[0].alias);
        const clients = getGoogleClients(accountAlias);
        const acct = getAccount(accountAlias);

        const event = await clients.calendar.events.insert({
          calendarId: 'primary',
          sendUpdates,
          requestBody: {
            summary,
            description,
            location,
            start: {
              dateTime: start,
              timeZone: process.env.TIMEZONE || 'UTC',
            },
            end: {
              dateTime: end,
              timeZone: process.env.TIMEZONE || 'UTC',
            },
            attendees: attendees?.map(email => ({ email })),
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: [
              `Event created on ${accountAlias} calendar (${acct?.email}):`,
              `  Title: ${summary}`,
              `  Time: ${start} → ${end}`,
              attendees ? `  Attendees: ${attendees.join(', ')}` : '',
              event.data.htmlLink ? `  Link: ${event.data.htmlLink}` : '',
            ].filter(Boolean).join('\n'),
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `calendar_create failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── calendar_freebusy ──────────────────────────────────────

  server.tool(
    'calendar_freebusy',
    'Check free/busy availability across accounts. Useful before creating invites.',
    {
      timeMin: z.string().describe('Start of range (ISO 8601)'),
      timeMax: z.string().describe('End of range (ISO 8601)'),
      accounts: z.array(z.string()).optional().describe('Account aliases to check (omit for all)'),
      additionalCalendars: z.array(z.string()).optional().describe('Additional calendar IDs/emails to check'),
    },
    async ({ timeMin, timeMax, accounts: accountAliases, additionalCalendars }) => {
      try {
        // Use the default account to query freebusy for all calendars
        const defaultAccount = getAccounts()[0];
        const clients = getGoogleClients(defaultAccount.alias);

        const calendarIds: string[] = [];

        // Add own calendars
        const targetAccounts = accountAliases
          ? accountAliases.map(a => getAccount(a)).filter(Boolean)
          : getAccounts();

        for (const acct of targetAccounts) {
          if (acct) calendarIds.push(acct.email);
        }

        // Add external calendars
        if (additionalCalendars) {
          calendarIds.push(...additionalCalendars);
        }

        const response = await clients.calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            timeZone: process.env.TIMEZONE || 'UTC',
            items: calendarIds.map(id => ({ id })),
          },
        });

        const calendars = response.data.calendars || {};
        const formatted = Object.entries(calendars).map(([calId, data]) => {
          const busy = (data as any).busy || [];
          if (busy.length === 0) {
            return `${calId}: Free`;
          }
          const busySlots = busy.map((slot: any) =>
            `  Busy: ${slot.start?.slice(11, 16) || '?'}–${slot.end?.slice(11, 16) || '?'}`
          ).join('\n');
          return `${calId}:\n${busySlots}`;
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text: `Availability (${timeMin} to ${timeMax}):\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `calendar_freebusy failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
