/**
 * Contacts Tools — Search, Lookup
 *
 * Unified contact search across Google Contacts, Gmail, vault, and calendar.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findContact, findEmail } from '@lifeos/shared';

export function registerContactsTools(server: McpServer) {

  // ─── contacts_search ────────────────────────────────────────

  server.tool(
    'contacts_search',
    'Search for contacts by name across all sources: Google Contacts, Gmail headers, vault project notes, and calendar attendees. Returns name, email, source, and organization.',
    {
      name: z.string().describe('Person name to search for'),
      limit: z.number().default(5).describe('Max results'),
    },
    async ({ name, limit }) => {
      try {
        const contacts = await findContact(name, limit);

        if (contacts.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `No contacts found matching "${name}". Try a different spelling or check if they appear in your emails/calendar.`,
            }],
          };
        }

        const formatted = contacts.map((c, i) => {
          const details = [
            `${i + 1}. **${c.name}** <${c.email}>`,
            `   Source: ${c.source}${c.account ? ` (${c.account})` : ''}`,
            c.organization ? `   Org: ${c.organization}` : '',
            c.phone ? `   Phone: ${c.phone}` : '',
          ].filter(Boolean).join('\n');
          return details;
        }).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `Found ${contacts.length} contact(s):\n\n${formatted}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `contacts_search failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── contacts_lookup ────────────────────────────────────────

  server.tool(
    'contacts_lookup',
    'Find a specific person\'s email address. Searches all sources and returns the best match. Useful before creating calendar invites or sending emails.',
    {
      name: z.string().describe('Person name to look up'),
    },
    async ({ name }) => {
      try {
        const email = await findEmail(name);

        if (!email) {
          return {
            content: [{
              type: 'text' as const,
              text: `Could not find an email for "${name}". They may not be in your contacts, emails, or meetings.`,
            }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `${name}: ${email}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `contacts_lookup failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
