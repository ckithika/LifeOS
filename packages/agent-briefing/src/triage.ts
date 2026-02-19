/**
 * Email triage — heuristic classification of unread emails
 *
 * Categories: urgent, action-needed, fyi, newsletter
 * Auto-archives newsletters by removing INBOX label.
 */

import type { EmailCategory, TriagedEmail } from '@lifeos/shared';

type GoogleClients = {
  gmail: any;
  calendar: any;
  tasks: any;
  drive: any;
  people: any;
};

export async function triageEmails(
  alias: string,
  clients: GoogleClients,
): Promise<TriagedEmail[]> {
  const triaged: TriagedEmail[] = [];

  try {
    const response = await clients.gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread in:inbox',
      maxResults: 20,
    });

    for (const msg of response.data.messages ?? []) {
      if (!msg.id) continue;

      try {
        const detail = await clients.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'List-Unsubscribe', 'Precedence'],
        });

        const headers = detail.data.payload?.headers ?? [];
        const getHeader = (name: string) =>
          headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        const from = getHeader('From');
        const to = getHeader('To');
        const cc = getHeader('Cc');
        const subject = getHeader('Subject');
        const date = getHeader('Date');
        const labels = detail.data.labelIds || [];

        const category = classifyEmail({
          from,
          to,
          cc,
          subject,
          labels,
          listUnsubscribe: getHeader('List-Unsubscribe'),
          precedence: getHeader('Precedence'),
        });

        triaged.push({
          id: msg.id,
          threadId: msg.threadId || '',
          account: alias,
          from,
          subject,
          date,
          category,
          snippet: detail.data.snippet || '',
        });

        // Auto-archive newsletters
        if (category === 'newsletter') {
          try {
            await clients.gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { removeLabelIds: ['INBOX'] },
            });
          } catch {
            // Non-critical — skip archive errors
          }
        }
      } catch {
        // Skip individual message errors
      }
    }
  } catch (error: any) {
    console.warn(`[triage] Error for ${alias}:`, error.message);
  }

  return triaged;
}

interface ClassifyInput {
  from: string;
  to: string;
  cc: string;
  subject: string;
  labels: string[];
  listUnsubscribe: string;
  precedence: string;
}

function classifyEmail(input: ClassifyInput): EmailCategory {
  const { from, cc, subject, labels, listUnsubscribe, precedence } = input;
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  // Newsletter detection
  const newsletterSenders = [
    'noreply@', 'no-reply@', 'newsletter@', 'notifications@',
    'donotreply@', 'do-not-reply@', 'updates@', 'mailer-daemon@',
  ];
  if (newsletterSenders.some(p => fromLower.includes(p))) return 'newsletter';
  if (listUnsubscribe) return 'newsletter';
  if (precedence.toLowerCase() === 'bulk' || precedence.toLowerCase() === 'list') return 'newsletter';
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'newsletter';

  // Urgent detection
  const urgentPatterns = ['urgent', 'asap', 'action required', 'immediate', 'critical', 'emergency'];
  if (urgentPatterns.some(p => subjectLower.includes(p))) return 'urgent';

  // Action-needed detection
  const actionPatterns = ['?', 'please', 'request', 'review', 'approve', 'confirm', 'action needed'];
  if (actionPatterns.some(p => subjectLower.includes(p))) return 'action-needed';

  // FYI detection — CC'd or forwarded
  if (cc && cc.length > 0) return 'fyi';
  if (subjectLower.startsWith('fwd:') || subjectLower.startsWith('fw:')) return 'fyi';

  return 'fyi';
}
