/**
 * Gmail Tools — Search, Read, Draft, Attachments
 *
 * All tools support multi-account: specify an account alias or search across all.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getAccounts,
  getGoogleClients,
  getDraftAccount,
  EmailMessage,
} from '@lifeos/shared';

export function registerGmailTools(server: McpServer) {

  // ─── gmail_search ───────────────────────────────────────────

  // @ts-expect-error TS2589: MCP SDK server.tool() deep type instantiation
  server.tool(
    'gmail_search',
    'Search emails across all Google accounts. Uses Gmail search syntax (from:, to:, subject:, has:attachment, etc). Returns snippets — use gmail_read for full content.',
    {
      query: z.string().describe('Gmail search query (e.g., "from:kevin subject:proposal")'),
      account: z.string().optional().describe('Account alias to search (omit to search all accounts)'),
      maxResults: z.number().default(10).describe('Max results per account (default 10)'),
    },
    async ({ query, account, maxResults }) => {
      try {
        const accounts = account
          ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
          : getAccounts();

        const allResults: Array<EmailMessage & { account: string }> = [];

        for (const acct of accounts) {
          if (!acct) continue;
          try {
            const clients = getGoogleClients(acct.alias);
            const response = await clients.gmail.users.messages.list({
              userId: 'me',
              q: query,
              maxResults,
            });

            for (const msg of response.data.messages || []) {
              const detail = await clients.gmail.users.messages.get({
                userId: 'me',
                id: msg.id!,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Subject', 'Date'],
              });

              const headers = detail.data.payload?.headers || [];
              const getHeader = (name: string) =>
                headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

              allResults.push({
                id: msg.id!,
                threadId: msg.threadId || '',
                account: acct.alias,
                from: getHeader('From'),
                to: (getHeader('To') || '').split(',').map(s => s.trim()),
                subject: getHeader('Subject'),
                snippet: detail.data.snippet || '',
                date: getHeader('Date'),
                labels: detail.data.labelIds || [],
              });
            }
          } catch (error) {
            allResults.push({
              id: 'error',
              threadId: '',
              account: acct.alias,
              from: '',
              to: [],
              subject: `Error searching ${acct.alias}: ${error instanceof Error ? error.message : 'unknown'}`,
              snippet: '',
              date: '',
              labels: [],
            });
          }
        }

        if (allResults.length === 0) {
          return { content: [{ type: 'text' as const, text: `No emails found for: "${query}"` }] };
        }

        const formatted = allResults.map(r => {
          if (r.id === 'error') return `Error: ${r.subject}`;
          return [
            `**${r.subject}** (${r.account})`,
            `  From: ${r.from}`,
            `  Date: ${r.date}`,
            `  ${r.snippet}`,
            `  [Thread: ${r.threadId}]`,
          ].join('\n');
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text: `${allResults.length} results:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `gmail_search failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── gmail_read ─────────────────────────────────────────────

  server.tool(
    'gmail_read',
    'Read a full email thread. Returns all messages in the thread with full body content.',
    {
      threadId: z.string().describe('Thread ID (from gmail_search results)'),
      account: z.string().describe('Account alias where this thread lives'),
    },
    async ({ threadId, account }) => {
      try {
        const clients = getGoogleClients(account);

        const response = await clients.gmail.users.threads.get({
          userId: 'me',
          id: threadId,
          format: 'full',
        });

        const messages = response.data.messages || [];
        const formatted = messages.map(msg => {
          const headers = msg.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          // Extract body (text/plain preferred, fallback to text/html)
          let body = '';
          const parts = msg.payload?.parts || [];

          if (parts.length > 0) {
            const textPart = parts.find(p => p.mimeType === 'text/plain');
            const htmlPart = parts.find(p => p.mimeType === 'text/html');
            const part = textPart || htmlPart;
            if (part?.body?.data) {
              body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
          } else if (msg.payload?.body?.data) {
            body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
          }

          // Strip HTML tags if we got HTML
          if (body.includes('<html') || body.includes('<div')) {
            body = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          }

          return [
            `---`,
            `From: ${getHeader('From')}`,
            `To: ${getHeader('To')}`,
            `Date: ${getHeader('Date')}`,
            `Subject: ${getHeader('Subject')}`,
            ``,
            body.slice(0, 3000), // Limit body length
          ].join('\n');
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text: formatted }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `gmail_read failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── gmail_draft ────────────────────────────────────────────

  // @ts-expect-error TS2589: MCP SDK server.tool() deep type instantiation
  server.tool(
    'gmail_draft',
    'Create an email draft. Automatically routes to the correct account based on project context.',
    {
      to: z.array(z.string()).describe('Recipient email addresses'),
      subject: z.string().describe('Email subject'),
      body: z.string().describe('Email body (plain text)'),
      cc: z.array(z.string()).optional().describe('CC recipients'),
      account: z.string().optional().describe('Account alias (auto-detected from project if omitted)'),
      project: z.string().optional().describe('Project slug for auto-routing'),
      replyToThreadId: z.string().optional().describe('Thread ID to reply to'),
    },
    async ({ to, subject, body, cc, account, project, replyToThreadId }) => {
      try {
        const accountAlias = account || getDraftAccount(project);
        const clients = getGoogleClients(accountAlias);

        // Build RFC 2822 email
        const emailLines = [
          `To: ${to.join(', ')}`,
          cc && cc.length > 0 ? `Cc: ${cc.join(', ')}` : '',
          `Subject: ${subject}`,
          `Content-Type: text/plain; charset=utf-8`,
          '',
          body,
        ].filter(Boolean);

        const raw = Buffer.from(emailLines.join('\r\n'))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const draft = await clients.gmail.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: {
              raw,
              threadId: replyToThreadId,
            },
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Draft created in ${accountAlias} account:\n` +
                  `  To: ${to.join(', ')}\n` +
                  `  Subject: ${subject}\n` +
                  `  Draft ID: ${draft.data.id}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `gmail_draft failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── gmail_attachments ──────────────────────────────────────

  // @ts-expect-error TS2589: MCP SDK server.tool() deep type instantiation
  server.tool(
    'gmail_attachments',
    'List or download attachments from an email message.',
    {
      messageId: z.string().describe('Message ID'),
      account: z.string().describe('Account alias'),
      download: z.boolean().default(false).describe('If true, returns attachment content as base64'),
      attachmentId: z.string().optional().describe('Specific attachment ID to download'),
    },
    async ({ messageId, account, download, attachmentId }) => {
      try {
        const clients = getGoogleClients(account);

        const msg = await clients.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });

        const attachments: Array<{
          filename: string;
          mimeType: string;
          size: number;
          id: string;
        }> = [];

        function findAttachments(parts: any[]) {
          for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
              attachments.push({
                filename: part.filename,
                mimeType: part.mimeType || 'application/octet-stream',
                size: part.body.size || 0,
                id: part.body.attachmentId,
              });
            }
            if (part.parts) findAttachments(part.parts);
          }
        }

        findAttachments(msg.data.payload?.parts || []);

        if (attachments.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No attachments found in this message.' }] };
        }

        if (!download) {
          const formatted = attachments.map((a, i) =>
            `${i + 1}. ${a.filename} (${a.mimeType}, ${Math.round(a.size / 1024)}KB) [ID: ${a.id}]`
          ).join('\n');
          return { content: [{ type: 'text' as const, text: `Attachments:\n${formatted}` }] };
        }

        // Download specific attachment
        const targetId = attachmentId || attachments[0].id;
        const attachment = await clients.gmail.users.messages.attachments.get({
          userId: 'me',
          messageId,
          id: targetId,
        });

        const targetInfo = attachments.find(a => a.id === targetId);

        return {
          content: [{
            type: 'text' as const,
            text: `Downloaded: ${targetInfo?.filename || 'attachment'} (${attachment.data.size} bytes)\nBase64 data available for processing.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `gmail_attachments failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
