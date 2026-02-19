/**
 * LifeOS — Unified Contact Lookup
 *
 * Searches for contacts across multiple sources in priority order:
 * 1. Google Contacts (People API) — all accounts
 * 2. Gmail sent/received headers — all accounts
 * 3. Vault project notes — Key Contacts sections
 * 4. Granola meeting attendees (via vault meeting files)
 * 5. Calendar event attendees — all accounts
 *
 * This allows LifeOS to find anyone's email even if they're not
 * in your contacts — they might be in a previous email or meeting.
 */

import { Contact } from './types.js';
import { getAccounts } from './config.js';
import { getGoogleClients } from './google-auth.js';
import { searchVault, readFile, listDirectory, isVaultConfigured } from './vault.js';

/**
 * Search for a contact by name across all sources.
 * Returns results ordered by confidence (exact matches first).
 *
 * @param name - Person's name to search for
 * @param limit - Maximum results to return
 */
export async function findContact(name: string, limit = 5): Promise<Contact[]> {
  const results: Contact[] = [];
  const seenEmails = new Set<string>();

  const addResult = (contact: Contact) => {
    const emailLower = contact.email.toLowerCase();
    if (!seenEmails.has(emailLower)) {
      seenEmails.add(emailLower);
      results.push(contact);
    }
  };

  // 1. Google Contacts (highest priority)
  try {
    const contactResults = await searchGoogleContacts(name);
    contactResults.forEach(addResult);
  } catch (error) {
    console.warn('Google Contacts search failed:', error);
  }

  // 2. Gmail headers
  if (results.length < limit) {
    try {
      const gmailResults = await searchGmailHeaders(name);
      gmailResults.forEach(addResult);
    } catch (error) {
      console.warn('Gmail header search failed:', error);
    }
  }

  // 3. Vault project notes
  if (results.length < limit) {
    try {
      const vaultResults = await searchVaultContacts(name);
      vaultResults.forEach(addResult);
    } catch (error) {
      console.warn('Vault contact search failed:', error);
    }
  }

  // 4. Calendar attendees
  if (results.length < limit) {
    try {
      const calResults = await searchCalendarAttendees(name);
      calResults.forEach(addResult);
    } catch (error) {
      console.warn('Calendar attendee search failed:', error);
    }
  }

  return results.slice(0, limit);
}

/**
 * Find a specific person's email address.
 * Convenience wrapper that returns the best match.
 */
export async function findEmail(name: string): Promise<string | null> {
  const results = await findContact(name, 1);
  return results.length > 0 ? results[0].email : null;
}

// ─── Source-Specific Search Functions ────────────────────────

/**
 * Search Google Contacts (People API) across all accounts.
 */
async function searchGoogleContacts(name: string): Promise<Contact[]> {
  const contacts: Contact[] = [];
  const accounts = getAccounts();

  for (const account of accounts) {
    try {
      const clients = getGoogleClients(account.alias);
      const response = await clients.people.people.searchContacts({
        query: name,
        readMask: 'names,emailAddresses,organizations,phoneNumbers',
        pageSize: 5,
      });

      for (const result of response.data.results || []) {
        const person = result.person;
        if (!person) continue;

        const email = person.emailAddresses?.[0]?.value;
        const displayName = person.names?.[0]?.displayName;
        if (!email) continue;

        contacts.push({
          name: displayName || name,
          email,
          source: 'contacts',
          account: account.alias,
          organization: person.organizations?.[0]?.name ?? undefined,
          phone: person.phoneNumbers?.[0]?.value ?? undefined,
        });
      }
    } catch {
      // Skip accounts where People API fails
    }
  }

  return contacts;
}

/**
 * Search Gmail sent/received headers for a name.
 * Finds emails that were sent to or received from someone.
 */
async function searchGmailHeaders(name: string): Promise<Contact[]> {
  const contacts: Contact[] = [];
  const accounts = getAccounts();

  for (const account of accounts) {
    try {
      const clients = getGoogleClients(account.alias);

      // Search for emails involving this person
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: `from:${name} OR to:${name}`,
        maxResults: 5,
      });

      for (const msg of response.data.messages || []) {
        const detail = await clients.gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Cc'],
        });

        const headers = detail.data.payload?.headers || [];
        for (const header of headers) {
          if (!header.value) continue;

          // Parse "Name <email>" format
          const parsed = parseEmailHeader(header.value);
          for (const { name: headerName, email } of parsed) {
            if (headerName.toLowerCase().includes(name.toLowerCase())) {
              contacts.push({
                name: headerName,
                email,
                source: 'gmail',
                account: account.alias,
              });
            }
          }
        }
      }
    } catch {
      // Skip accounts where Gmail search fails
    }
  }

  return contacts;
}

/**
 * Search vault project notes for contacts mentioned in Key Contacts sections.
 */
async function searchVaultContacts(name: string): Promise<Contact[]> {
  if (!isVaultConfigured()) return [];

  const contacts: Contact[] = [];

  try {
    const searchResults = await searchVault(name);

    for (const result of searchResults) {
      if (!result.path.startsWith('Projects/')) continue;

      const file = await readFile(result.path);
      if (!file) continue;

      // Look for email patterns near the name
      const lines = file.content.split('\n');
      for (const line of lines) {
        if (line.toLowerCase().includes(name.toLowerCase())) {
          const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
          if (emailMatch) {
            contacts.push({
              name,
              email: emailMatch[0],
              source: 'vault',
            });
          }
        }
      }
    }
  } catch {
    // Vault search may fail if not configured
  }

  return contacts;
}

/**
 * Search calendar event attendees across all accounts.
 */
async function searchCalendarAttendees(name: string): Promise<Contact[]> {
  const contacts: Contact[] = [];
  const accounts = getAccounts();

  // Search recent events (last 30 days)
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 30);

  for (const account of accounts) {
    try {
      const clients = getGoogleClients(account.alias);
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        maxResults: 50,
        singleEvents: true,
        q: name,
      });

      for (const event of response.data.items || []) {
        for (const attendee of event.attendees || []) {
          const attendeeName = attendee.displayName || '';
          if (attendeeName.toLowerCase().includes(name.toLowerCase()) && attendee.email) {
            contacts.push({
              name: attendeeName,
              email: attendee.email,
              source: 'calendar',
              account: account.alias,
            });
          }
        }
      }
    } catch {
      // Skip accounts where Calendar fails
    }
  }

  return contacts;
}

// ─── Utilities ──────────────────────────────────────────────

/**
 * Parse email header value like "Name <email@example.com>" or "email@example.com"
 */
function parseEmailHeader(header: string): Array<{ name: string; email: string }> {
  const results: Array<{ name: string; email: string }> = [];

  // Split by comma for multiple recipients
  const parts = header.split(',');

  for (const part of parts) {
    const trimmed = part.trim();

    // "Name <email>" format
    const match = trimmed.match(/^"?(.+?)"?\s*<(.+?)>$/);
    if (match) {
      results.push({ name: match[1].trim(), email: match[2].trim() });
      continue;
    }

    // Plain email format
    const emailMatch = trimmed.match(/^[\w.+-]+@[\w.-]+\.\w+$/);
    if (emailMatch) {
      results.push({ name: trimmed, email: trimmed });
    }
  }

  return results;
}
