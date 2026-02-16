/**
 * Shared tool definitions, executor, and router.
 *
 * Provider-agnostic: tools are defined in JSON Schema style and converted
 * to Anthropic or Gemini format via helper functions.
 */

import { triggerBriefing, triggerResearch } from './agent-client.js';
import {
  // Config & Auth
  getAccounts,
  getAccount,
  getDefaultTasksAccount,
  getCalendarAccount,
  getDraftAccount,
  getGoogleClients,
  getFileSizeLimit,
  // Vault
  readFile,
  writeFile,
  deleteFile,
  searchVault,
  listDirectory,
  listProjects,
  createProject,
  getDailyNote,
  // Contacts
  findContact,
  findEmail,
} from '@lifeos/shared';
import type { CalendarEvent, TaskItem, DriveFile, EmailMessage } from '@lifeos/shared';
import type Anthropic from '@anthropic-ai/sdk';

// ─── Provider-Agnostic Tool Definition ────────────────────────

export interface ToolParam {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// ─── Tool Definitions ─────────────────────────────────────────

export const TOOL_DEFS: ToolParam[] = [
  // ── Calendar ────────────────────────────────────────────────
  {
    name: 'calendar_list',
    description: 'List calendar events across all accounts for a date range. Returns events from all connected calendars.',
    parameters: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'Start of range (ISO 8601, e.g. "2026-02-16T00:00:00+03:00")' },
        timeMax: { type: 'string', description: 'End of range (ISO 8601)' },
        account: { type: 'string', description: 'Account alias (omit to search all)' },
        query: { type: 'string', description: 'Free-text search within events' },
        maxResults: { type: 'number', description: 'Max results per account (default 25)' },
      },
      required: ['timeMin', 'timeMax'],
    },
  },
  {
    name: 'calendar_create',
    description: 'Create a calendar event with optional attendees. Routes to the correct account based on project.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time (ISO 8601 with timezone, e.g. 2026-02-16T11:00:00+03:00)' },
        end: { type: 'string', description: 'End time (ISO 8601 with timezone)' },
        description: { type: 'string', description: 'Event description/agenda' },
        location: { type: 'string', description: 'Event location or video call link' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
        account: { type: 'string', description: 'Account alias (auto-routed if omitted)' },
        project: { type: 'string', description: 'Project slug for auto-routing' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  {
    name: 'calendar_freebusy',
    description: 'Check free/busy availability across accounts. Useful before creating invites.',
    parameters: {
      type: 'object',
      properties: {
        timeMin: { type: 'string', description: 'Start of range (ISO 8601)' },
        timeMax: { type: 'string', description: 'End of range (ISO 8601)' },
        accounts: { type: 'array', items: { type: 'string' }, description: 'Account aliases to check (omit for all)' },
      },
      required: ['timeMin', 'timeMax'],
    },
  },

  // ── Gmail ───────────────────────────────────────────────────
  {
    name: 'gmail_search',
    description: 'Search emails across all Google accounts. Uses Gmail search syntax (from:, to:, subject:, has:attachment). Returns snippets — use gmail_read for full content.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail search query (e.g. "from:kevin subject:proposal")' },
        account: { type: 'string', description: 'Account alias to search (omit for all)' },
        maxResults: { type: 'number', description: 'Max results per account (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_read',
    description: 'Read a full email thread. Returns all messages with full body content.',
    parameters: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread ID (from gmail_search results)' },
        account: { type: 'string', description: 'Account alias where this thread lives' },
      },
      required: ['threadId', 'account'],
    },
  },
  {
    name: 'gmail_draft',
    description: 'Create an email draft. Automatically routes to the correct account based on project context.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
        subject: { type: 'string', description: 'Email subject' },
        body: { type: 'string', description: 'Email body (plain text)' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC recipients' },
        account: { type: 'string', description: 'Account alias (auto-detected if omitted)' },
        project: { type: 'string', description: 'Project slug for auto-routing' },
        replyToThreadId: { type: 'string', description: 'Thread ID to reply to' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_attachments',
    description: 'List attachments from an email message.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Message ID' },
        account: { type: 'string', description: 'Account alias' },
      },
      required: ['messageId', 'account'],
    },
  },

  // ── Tasks ───────────────────────────────────────────────────
  {
    name: 'tasks_list',
    description: 'List tasks across all accounts. Shows title, due date, status, and which account.',
    parameters: {
      type: 'object',
      properties: {
        account: { type: 'string', description: 'Account alias (omit for all)' },
        showCompleted: { type: 'boolean', description: 'Include completed tasks (default false)' },
        maxResults: { type: 'number', description: 'Max results per task list (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'tasks_create',
    description: 'Create a new Google Task.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        notes: { type: 'string', description: 'Task description/notes' },
        due: { type: 'string', description: 'Due date (ISO 8601, e.g. "2026-02-20T00:00:00Z")' },
        account: { type: 'string', description: 'Account alias (defaults to primary tasks account)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'tasks_update',
    description: 'Update or complete a task. Can change title, notes, due date, or mark as completed.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID' },
        account: { type: 'string', description: 'Account alias' },
        title: { type: 'string', description: 'New title' },
        notes: { type: 'string', description: 'New notes' },
        due: { type: 'string', description: 'New due date' },
        completed: { type: 'boolean', description: 'Mark as completed (true) or uncomplete (false)' },
      },
      required: ['taskId', 'account'],
    },
  },

  // ── Drive ───────────────────────────────────────────────────
  {
    name: 'drive_list',
    description: 'List and search files in Google Drive across accounts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (Drive syntax: name contains, fullText contains, etc)' },
        account: { type: 'string', description: 'Account alias (omit for all)' },
        folderId: { type: 'string', description: 'Folder ID to list contents of' },
        maxResults: { type: 'number', description: 'Max results per account (default 20)' },
        mimeType: { type: 'string', description: 'Filter by MIME type (e.g. "application/pdf")' },
      },
      required: [],
    },
  },
  {
    name: 'drive_download',
    description: 'Download a file from Google Drive. For Google Docs/Sheets/Slides, exports to specified format.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Drive file ID' },
        account: { type: 'string', description: 'Account alias' },
        exportFormat: { type: 'string', description: 'Export format for Workspace files (e.g. "text/markdown", "text/csv")' },
      },
      required: ['fileId', 'account'],
    },
  },
  {
    name: 'drive_upload',
    description: 'Upload a file to Google Drive. Use convertTo to create native Google Docs or Sheets (provide HTML or CSV content). Google Slides cannot be created from scratch — use drive_copy_template instead.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'File name' },
        content: { type: 'string', description: 'File content (text, HTML for Docs, CSV for Sheets, or base64 for binary)' },
        account: { type: 'string', description: 'Account alias' },
        mimeType: { type: 'string', description: 'MIME type of the content (default text/plain). Use text/html for Docs, text/csv for Sheets.' },
        folderId: { type: 'string', description: 'Parent folder ID' },
        convertTo: { type: 'string', enum: ['document', 'spreadsheet'], description: 'Convert to native Google format: "document" (Google Docs) or "spreadsheet" (Google Sheets)' },
      },
      required: ['name', 'content', 'account'],
    },
  },
  {
    name: 'drive_copy_template',
    description: 'Create a new Google Docs, Sheets, or Slides file by copying an existing template. Use this for Google Slides since they cannot be created from scratch.',
    parameters: {
      type: 'object',
      properties: {
        templateFileId: { type: 'string', description: 'File ID of the template to copy' },
        name: { type: 'string', description: 'Name for the new file' },
        account: { type: 'string', description: 'Account alias' },
        folderId: { type: 'string', description: 'Parent folder ID for the copy' },
      },
      required: ['templateFileId', 'name', 'account'],
    },
  },
  {
    name: 'drive_create_folder',
    description: 'Create a new folder in Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        account: { type: 'string', description: 'Account alias' },
        parentId: { type: 'string', description: 'Parent folder ID (omit for root)' },
      },
      required: ['name', 'account'],
    },
  },
  {
    name: 'drive_organize',
    description: 'Move or rename files in Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File ID to move/rename' },
        account: { type: 'string', description: 'Account alias' },
        newName: { type: 'string', description: 'New file name' },
        newParentId: { type: 'string', description: 'New parent folder ID' },
        removeFromParentId: { type: 'string', description: 'Current parent folder ID to remove from' },
      },
      required: ['fileId', 'account'],
    },
  },
  {
    name: 'drive_delete',
    description: 'Move a file/folder to trash in Google Drive (recoverable for 30 days).',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File or folder ID to trash' },
        account: { type: 'string', description: 'Account alias' },
      },
      required: ['fileId', 'account'],
    },
  },

  // ── Contacts ────────────────────────────────────────────────
  {
    name: 'contacts_search',
    description: 'Search for contacts by name across all sources: Google Contacts, Gmail, vault, calendar. Returns name, email, source, org.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Person name to search for' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'contacts_lookup',
    description: "Find a person's email address. Useful before creating calendar invites or sending emails.",
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Person name to look up' },
      },
      required: ['name'],
    },
  },

  // ── Vault (Obsidian) ───────────────────────────────────────
  {
    name: 'read_note',
    description: 'Read a file from the Obsidian vault. Use paths relative to vault root.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root (e.g. "Areas/Projects/Open Source/lifeos/README.md")' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_note',
    description: 'Create or update a file in the Obsidian vault. Overwrites the entire file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
        content: { type: 'string', description: 'Complete file content (Markdown)' },
        message: { type: 'string', description: 'Commit message' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'search_vault',
    description: 'Search for content across the entire Obsidian vault. Returns matching files with context snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (searches file contents)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_projects',
    description: 'List all projects in the vault with status.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project folder with README.md, meeting-notes.md, and subfolders.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'URL-safe project slug (e.g. "new-product-launch")' },
        title: { type: 'string', description: 'Human-readable project title' },
        category: { type: 'string', description: 'Project category (e.g. "Consulting", "Open Source")' },
      },
      required: ['slug', 'title'],
    },
  },
  {
    name: 'list_files',
    description: 'Browse files in the vault. Lists contents of any directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to list (default: "Files")' },
      },
      required: [],
    },
  },
  {
    name: 'daily_note',
    description: "Read or append to today's daily note (or a specific date).",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (defaults to today)' },
        append: { type: 'string', description: 'Content to append. Omit to just read.' },
        section: { type: 'string', description: 'Section to append under (e.g. "Notes", "Suggested Actions")' },
      },
      required: [],
    },
  },
  {
    name: 'delete_note',
    description: 'Delete a file from the Obsidian vault (recoverable via git history).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to vault root' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_note',
    description: 'Move or rename a file in the Obsidian vault.',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Current file path' },
        to: { type: 'string', description: 'New file path' },
      },
      required: ['from', 'to'],
    },
  },

  // ── Agents ──────────────────────────────────────────────────
  {
    name: 'trigger_briefing',
    description: 'Generate the daily briefing (calendar + tasks + emails + follow-ups)',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' },
      },
      required: [],
    },
  },
  {
    name: 'research',
    description: 'Research a topic using the LifeOS research agent',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The research topic or question' },
      },
      required: ['query'],
    },
  },
];

// ─── Format Converters ────────────────────────────────────────

/** Convert to Anthropic tool format */
export function toAnthropicTools(defs: ToolParam[]): Anthropic.Messages.Tool[] {
  return defs.map(d => ({
    name: d.name,
    description: d.description,
    input_schema: {
      type: 'object' as const,
      properties: d.parameters.properties,
      required: d.parameters.required,
    },
  }));
}

/** Convert to Gemini function declaration format */
export function toGeminiTools(defs: ToolParam[]): Array<{
  name: string;
  description: string;
  parameters: { type: string; properties: Record<string, unknown>; required: string[] };
}> {
  return defs.map(d => ({
    name: d.name,
    description: d.description,
    parameters: {
      type: 'OBJECT',
      properties: d.parameters.properties,
      required: d.parameters.required,
    },
  }));
}

// ─── Tool Execution ───────────────────────────────────────────

function getDefaultExportFormat(mimeType: string): string {
  const exportMap: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/markdown',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'application/pdf',
    'application/vnd.google-apps.drawing': 'image/png',
  };
  return exportMap[mimeType] || 'application/pdf';
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {

    // ── Calendar ────────────────────────────────────────────
    case 'calendar_list': {
      const { timeMin, timeMax, account, query, maxResults = 25 } = input as any;
      const events: CalendarEvent[] = [];
      const accounts = account
        ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
        : getAccounts();

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
          for (const event of response.data.items ?? []) {
            events.push({
              id: event.id ?? '',
              summary: event.summary ?? '(No title)',
              description: event.description ?? undefined,
              start: event.start?.dateTime ?? event.start?.date ?? '',
              end: event.end?.dateTime ?? event.end?.date ?? '',
              location: event.location ?? undefined,
              attendees: (event.attendees ?? []).map((a: any) => ({
                email: a.email ?? '',
                displayName: a.displayName ?? undefined,
                responseStatus: a.responseStatus,
              })),
              status: event.status ?? 'confirmed',
              account: acct.alias,
              calendarId: 'primary',
              htmlLink: event.htmlLink ?? undefined,
            });
          }
        } catch (e: any) {
          console.warn(`[tools] Calendar error for ${acct.alias}:`, e.message);
        }
      }
      events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      return JSON.stringify({ events, count: events.length });
    }

    case 'calendar_create': {
      const { summary, start, end, description, location, attendees, account: acctAlias, project } = input as any;
      const accountAlias = acctAlias || (project ? getCalendarAccount(project) : 'personal');
      try {
        const { calendar } = getGoogleClients(accountAlias);
        const event = await calendar.events.insert({
          calendarId: 'primary',
          sendUpdates: 'all',
          requestBody: {
            summary,
            description: description || undefined,
            location: location || undefined,
            start: { dateTime: start, timeZone: process.env.TIMEZONE || 'Africa/Nairobi' },
            end: { dateTime: end, timeZone: process.env.TIMEZONE || 'Africa/Nairobi' },
            attendees: attendees?.map((email: string) => ({ email })),
          },
        });
        return JSON.stringify({
          success: true,
          event: {
            id: event.data.id,
            summary: event.data.summary,
            start: event.data.start?.dateTime,
            end: event.data.end?.dateTime,
            htmlLink: event.data.htmlLink,
          },
        });
      } catch (e: any) {
        return JSON.stringify({ error: `Failed to create event: ${e.message}` });
      }
    }

    case 'calendar_freebusy': {
      const { timeMin, timeMax, accounts: accountAliases } = input as any;
      try {
        const defaultAccount = getAccounts()[0];
        const { calendar } = getGoogleClients(defaultAccount.alias);
        const targetAccounts = accountAliases
          ? accountAliases.map((a: string) => getAccount(a)).filter(Boolean)
          : getAccounts();
        const calendarIds = targetAccounts.map((a: any) => a.email);

        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin,
            timeMax,
            timeZone: process.env.TIMEZONE || 'Africa/Nairobi',
            items: calendarIds.map((id: string) => ({ id })),
          },
        });

        const calendars = response.data.calendars || {};
        const result: Record<string, any[]> = {};
        for (const [calId, data] of Object.entries(calendars)) {
          result[calId] = (data as any).busy || [];
        }
        return JSON.stringify({ availability: result });
      } catch (e: any) {
        return JSON.stringify({ error: `calendar_freebusy failed: ${e.message}` });
      }
    }

    // ── Gmail ───────────────────────────────────────────────
    case 'gmail_search': {
      const { query, account, maxResults = 10 } = input as any;
      const results: Array<EmailMessage & { account: string }> = [];
      const accounts = account
        ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
        : getAccounts();

      for (const acct of accounts) {
        if (!acct) continue;
        try {
          const clients = getGoogleClients(acct.alias);
          const response = await clients.gmail.users.messages.list({
            userId: 'me',
            q: query,
            maxResults,
          });
          for (const msg of response.data.messages ?? []) {
            const detail = await clients.gmail.users.messages.get({
              userId: 'me',
              id: msg.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            });
            const headers = detail.data.payload?.headers ?? [];
            const getHeader = (name: string) =>
              headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
            results.push({
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
        } catch (e: any) {
          console.warn(`[tools] Gmail search error for ${acct.alias}:`, e.message);
        }
      }
      return JSON.stringify({ emails: results, count: results.length });
    }

    case 'gmail_read': {
      const { threadId, account } = input as any;
      try {
        const clients = getGoogleClients(account);
        const response = await clients.gmail.users.threads.get({
          userId: 'me',
          id: threadId,
          format: 'full',
        });
        const messages = (response.data.messages ?? []).map(msg => {
          const headers = msg.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
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
          if (body.includes('<html') || body.includes('<div')) {
            body = body.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          }
          return {
            from: getHeader('From'),
            to: getHeader('To'),
            date: getHeader('Date'),
            subject: getHeader('Subject'),
            body: body.slice(0, 3000),
          };
        });
        return JSON.stringify({ messages });
      } catch (e: any) {
        return JSON.stringify({ error: `gmail_read failed: ${e.message}` });
      }
    }

    case 'gmail_draft': {
      const { to, subject, body, cc, account: acctAlias, project, replyToThreadId } = input as any;
      try {
        const accountAlias = acctAlias || getDraftAccount(project);
        const clients = getGoogleClients(accountAlias);
        const emailLines = [
          `To: ${(to as string[]).join(', ')}`,
          cc?.length > 0 ? `Cc: ${(cc as string[]).join(', ')}` : '',
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
          requestBody: { message: { raw, threadId: replyToThreadId } },
        });
        return JSON.stringify({ success: true, draft: { id: draft.data.id, to, subject, account: accountAlias } });
      } catch (e: any) {
        return JSON.stringify({ error: `gmail_draft failed: ${e.message}` });
      }
    }

    case 'gmail_attachments': {
      const { messageId, account } = input as any;
      try {
        const clients = getGoogleClients(account);
        const msg = await clients.gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'full',
        });
        const attachments: Array<{ filename: string; mimeType: string; size: number; id: string }> = [];
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
        return JSON.stringify({ attachments, count: attachments.length });
      } catch (e: any) {
        return JSON.stringify({ error: `gmail_attachments failed: ${e.message}` });
      }
    }

    // ── Tasks ───────────────────────────────────────────────
    case 'tasks_list': {
      const { account, showCompleted = false, maxResults = 50 } = input as any;
      const tasks: TaskItem[] = [];
      const accounts = account
        ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
        : getAccounts();

      for (const acct of accounts) {
        if (!acct) continue;
        try {
          const clients = getGoogleClients(acct.alias);
          const taskLists = await clients.tasks.tasklists.list();
          for (const list of taskLists.data.items ?? []) {
            const response = await clients.tasks.tasks.list({
              tasklist: list.id!,
              showCompleted,
              showHidden: false,
              maxResults,
            });
            for (const task of response.data.items ?? []) {
              tasks.push({
                id: task.id ?? '',
                title: task.title ?? '(No title)',
                notes: task.notes ?? undefined,
                due: task.due ?? undefined,
                status: (task.status as TaskItem['status']) || 'needsAction',
                completed: task.completed ?? undefined,
                taskListId: list.id ?? '',
                account: acct.alias,
              });
            }
          }
        } catch (e: any) {
          console.warn(`[tools] Tasks error for ${acct.alias}:`, e.message);
        }
      }
      tasks.sort((a, b) => {
        if (a.status !== b.status) return a.status === 'needsAction' ? -1 : 1;
        return (a.due || '9999').localeCompare(b.due || '9999');
      });
      return JSON.stringify({ tasks, count: tasks.length });
    }

    case 'tasks_create': {
      const { title, notes, due, account: acctAlias } = input as any;
      try {
        const acct = acctAlias
          ? getAccounts().find(a => a.alias === acctAlias)
          : getDefaultTasksAccount();
        if (!acct) return JSON.stringify({ error: `Account "${acctAlias}" not found.` });
        const clients = getGoogleClients(acct.alias);
        const lists = await clients.tasks.tasklists.list();
        const listId = lists.data.items?.[0]?.id || '@default';
        const task = await clients.tasks.tasks.insert({
          tasklist: listId,
          requestBody: { title, notes, due },
        });
        return JSON.stringify({ success: true, task: { id: task.data.id, title, due, account: acct.alias } });
      } catch (e: any) {
        return JSON.stringify({ error: `tasks_create failed: ${e.message}` });
      }
    }

    case 'tasks_update': {
      const { taskId, account, title, notes, due, completed } = input as any;
      try {
        const clients = getGoogleClients(account);
        const lists = await clients.tasks.tasklists.list();
        const listId = lists.data.items?.[0]?.id || '@default';
        const updateBody: Record<string, any> = {};
        if (title !== undefined) updateBody.title = title;
        if (notes !== undefined) updateBody.notes = notes;
        if (due !== undefined) updateBody.due = due;
        if (completed === true) {
          updateBody.status = 'completed';
          updateBody.completed = new Date().toISOString();
        } else if (completed === false) {
          updateBody.status = 'needsAction';
          updateBody.completed = null;
        }
        await clients.tasks.tasks.patch({
          tasklist: listId,
          task: taskId,
          requestBody: updateBody,
        });
        return JSON.stringify({ success: true, updated: Object.keys(updateBody) });
      } catch (e: any) {
        return JSON.stringify({ error: `tasks_update failed: ${e.message}` });
      }
    }

    // ── Drive ───────────────────────────────────────────────
    case 'drive_list': {
      const { query, account, folderId, maxResults = 20, mimeType } = input as any;
      const files: DriveFile[] = [];
      const accounts = account
        ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
        : getAccounts();

      for (const acct of accounts) {
        if (!acct) continue;
        try {
          const clients = getGoogleClients(acct.alias);
          const queryParts: string[] = ['trashed = false'];
          if (query) queryParts.push(`(name contains '${query}' or fullText contains '${query}')`);
          if (folderId) queryParts.push(`'${folderId}' in parents`);
          if (mimeType) queryParts.push(`mimeType = '${mimeType}'`);
          const response = await clients.drive.files.list({
            q: queryParts.join(' and '),
            pageSize: maxResults,
            fields: 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
            orderBy: 'modifiedTime desc',
          });
          for (const file of response.data.files ?? []) {
            files.push({
              id: file.id || '',
              account: acct.alias,
              name: file.name || '',
              mimeType: file.mimeType || '',
              size: file.size ? parseInt(file.size, 10) : undefined,
              modifiedTime: file.modifiedTime || '',
              parents: file.parents || undefined,
              webViewLink: file.webViewLink || undefined,
            });
          }
        } catch (e: any) {
          console.warn(`[tools] Drive error for ${acct.alias}:`, e.message);
        }
      }
      return JSON.stringify({ files, count: files.length });
    }

    case 'drive_download': {
      const { fileId, account, exportFormat } = input as any;
      try {
        const clients = getGoogleClients(account);
        const meta = await clients.drive.files.get({ fileId, fields: 'id,name,mimeType,size' });
        const mimeType = meta.data.mimeType || '';
        const name = meta.data.name || 'file';
        const size = meta.data.size ? parseInt(meta.data.size, 10) : 0;
        if (size > getFileSizeLimit()) {
          return JSON.stringify({ error: `File "${name}" (${Math.round(size / 1024 / 1024)}MB) exceeds size limit.` });
        }
        const isWorkspaceFile = mimeType.startsWith('application/vnd.google-apps.');
        let content: string;
        if (isWorkspaceFile) {
          const format = exportFormat || getDefaultExportFormat(mimeType);
          const response = await clients.drive.files.export({ fileId, mimeType: format }, { responseType: 'text' });
          content = response.data as string;
        } else {
          const response = await clients.drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' });
          content = response.data as string;
        }
        return JSON.stringify({ name, content: content.slice(0, 10000), truncated: content.length > 10000 });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_download failed: ${e.message}` });
      }
    }

    case 'drive_upload': {
      const { name, content, account, mimeType = 'text/plain', folderId, convertTo } = input as any;
      try {
        const clients = getGoogleClients(account);
        const requestBody: Record<string, any> = {
          name,
          parents: folderId ? [folderId] : undefined,
        };
        // Set target mimeType to convert to native Google format
        if (convertTo === 'document') {
          requestBody.mimeType = 'application/vnd.google-apps.document';
        } else if (convertTo === 'spreadsheet') {
          requestBody.mimeType = 'application/vnd.google-apps.spreadsheet';
        }
        const response = await clients.drive.files.create({
          requestBody,
          media: { mimeType, body: content },
          fields: 'id,name,webViewLink',
        });
        const format = convertTo ? `Google ${convertTo === 'document' ? 'Doc' : 'Sheet'}` : name;
        return JSON.stringify({ success: true, file: { id: response.data.id, name, format, webViewLink: response.data.webViewLink } });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_upload failed: ${e.message}` });
      }
    }

    case 'drive_copy_template': {
      const { templateFileId, name, account, folderId } = input as any;
      try {
        const clients = getGoogleClients(account);
        const response = await clients.drive.files.copy({
          fileId: templateFileId,
          requestBody: {
            name,
            parents: folderId ? [folderId] : undefined,
          },
          fields: 'id,name,mimeType,webViewLink',
        });
        return JSON.stringify({ success: true, file: { id: response.data.id, name, mimeType: response.data.mimeType, webViewLink: response.data.webViewLink } });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_copy_template failed: ${e.message}` });
      }
    }

    case 'drive_create_folder': {
      const { name, account, parentId } = input as any;
      try {
        const clients = getGoogleClients(account);
        const response = await clients.drive.files.create({
          requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined,
          },
          fields: 'id,name,webViewLink',
        });
        return JSON.stringify({ success: true, folder: { id: response.data.id, name, webViewLink: response.data.webViewLink } });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_create_folder failed: ${e.message}` });
      }
    }

    case 'drive_organize': {
      const { fileId, account, newName, newParentId, removeFromParentId } = input as any;
      try {
        const clients = getGoogleClients(account);
        const updateBody: Record<string, any> = {};
        if (newName) updateBody.name = newName;
        await clients.drive.files.update({
          fileId,
          requestBody: updateBody,
          addParents: newParentId,
          removeParents: removeFromParentId,
          fields: 'id,name,parents',
        });
        const actions = [];
        if (newName) actions.push(`renamed to "${newName}"`);
        if (newParentId) actions.push(`moved to folder ${newParentId}`);
        return JSON.stringify({ success: true, actions });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_organize failed: ${e.message}` });
      }
    }

    case 'drive_delete': {
      const { fileId, account } = input as any;
      try {
        const clients = getGoogleClients(account);
        const meta = await clients.drive.files.get({ fileId, fields: 'id,name,mimeType' });
        const name = meta.data.name || fileId;
        await clients.drive.files.update({ fileId, requestBody: { trashed: true } });
        return JSON.stringify({ success: true, trashed: name });
      } catch (e: any) {
        return JSON.stringify({ error: `drive_delete failed: ${e.message}` });
      }
    }

    // ── Contacts ────────────────────────────────────────────
    case 'contacts_search': {
      const { name, limit = 5 } = input as any;
      try {
        const contacts = await findContact(name, limit);
        return JSON.stringify({ contacts, count: contacts.length });
      } catch (e: any) {
        return JSON.stringify({ error: `contacts_search failed: ${e.message}` });
      }
    }

    case 'contacts_lookup': {
      const { name } = input as any;
      try {
        const email = await findEmail(name);
        return email
          ? JSON.stringify({ name, email })
          : JSON.stringify({ error: `No email found for "${name}"` });
      } catch (e: any) {
        return JSON.stringify({ error: `contacts_lookup failed: ${e.message}` });
      }
    }

    // ── Vault ───────────────────────────────────────────────
    case 'read_note': {
      const { path } = input as any;
      try {
        const file = await readFile(path);
        return file ? file.content : JSON.stringify({ error: `File not found: ${path}` });
      } catch (e: any) {
        return JSON.stringify({ error: `read_note failed: ${e.message}` });
      }
    }

    case 'write_note': {
      const { path, content, message } = input as any;
      try {
        const sha = await writeFile(path, content, message || 'Telegram: update note');
        return JSON.stringify({ success: true, path, sha: sha.slice(0, 7) });
      } catch (e: any) {
        return JSON.stringify({ error: `write_note failed: ${e.message}` });
      }
    }

    case 'search_vault': {
      const { query } = input as any;
      try {
        const results = await searchVault(query);
        return JSON.stringify({ results, count: results.length });
      } catch (e: any) {
        return JSON.stringify({ error: `search_vault failed: ${e.message}` });
      }
    }

    case 'list_projects': {
      try {
        const projects = await listProjects();
        return JSON.stringify({ projects, count: projects.length });
      } catch (e: any) {
        return JSON.stringify({ error: `list_projects failed: ${e.message}` });
      }
    }

    case 'create_project': {
      const { slug, title, category } = input as any;
      try {
        const project = await createProject(slug, title, category);
        return JSON.stringify({ success: true, project });
      } catch (e: any) {
        return JSON.stringify({ error: `create_project failed: ${e.message}` });
      }
    }

    case 'list_files': {
      const { path } = input as any;
      try {
        const dirPath = path || 'Files';
        const entries = await listDirectory(dirPath);
        return JSON.stringify({ path: dirPath, entries, count: entries.length });
      } catch (e: any) {
        return JSON.stringify({ error: `list_files failed: ${e.message}` });
      }
    }

    case 'daily_note': {
      const { date, append, section } = input as any;
      try {
        const note = await getDailyNote(date);
        if (!append) return note.content;
        let newContent = note.content;
        if (section) {
          const sectionHeader = `## ${section}`;
          const sectionIndex = newContent.indexOf(sectionHeader);
          if (sectionIndex !== -1) {
            const afterSection = newContent.indexOf('\n## ', sectionIndex + sectionHeader.length);
            const insertPoint = afterSection !== -1 ? afterSection : newContent.length;
            newContent = newContent.slice(0, insertPoint) + '\n' + append + '\n' + newContent.slice(insertPoint);
          } else {
            newContent += '\n' + append + '\n';
          }
        } else {
          newContent += '\n' + append + '\n';
        }
        await writeFile(note.path, newContent, `lifeos: update daily note ${note.date}`);
        return JSON.stringify({ success: true, path: note.path });
      } catch (e: any) {
        return JSON.stringify({ error: `daily_note failed: ${e.message}` });
      }
    }

    case 'delete_note': {
      const { path } = input as any;
      try {
        await deleteFile(path);
        return JSON.stringify({ success: true, deleted: path });
      } catch (e: any) {
        return JSON.stringify({ error: `delete_note failed: ${e.message}` });
      }
    }

    case 'move_note': {
      const { from, to } = input as any;
      try {
        const file = await readFile(from);
        if (!file) return JSON.stringify({ error: `File not found: ${from}` });
        await writeFile(to, file.content, `lifeos: move ${from} → ${to}`);
        await deleteFile(from, `lifeos: move ${from} → ${to} (cleanup)`);
        return JSON.stringify({ success: true, from, to });
      } catch (e: any) {
        return JSON.stringify({ error: `move_note failed: ${e.message}` });
      }
    }

    // ── Agents ──────────────────────────────────────────────
    case 'trigger_briefing': {
      const result = await triggerBriefing(input.date as string);
      return result.error ? JSON.stringify({ error: result.error }) : result.text;
    }

    case 'research': {
      const result = await triggerResearch(input.query as string);
      return result.error ? JSON.stringify({ error: result.error }) : result.text;
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// ─── Tool Routing ─────────────────────────────────────────────

export const TOOL_GROUPS: Record<string, string[]> = {
  calendar: ['calendar_list', 'calendar_create', 'calendar_freebusy'],
  email: ['gmail_search', 'gmail_read', 'gmail_draft', 'gmail_attachments'],
  tasks: ['tasks_list', 'tasks_create', 'tasks_update'],
  drive: ['drive_list', 'drive_download', 'drive_upload', 'drive_copy_template', 'drive_create_folder', 'drive_organize', 'drive_delete'],
  contacts: ['contacts_search', 'contacts_lookup'],
  vault: ['read_note', 'write_note', 'search_vault', 'list_projects', 'create_project', 'list_files', 'daily_note', 'delete_note', 'move_note'],
  agents: ['trigger_briefing', 'research'],
};

const ROUTE_PATTERNS: Array<{ pattern: RegExp; groups: string[] }> = [
  // Calendar/scheduling — include vault for meeting notes context
  { pattern: /schedul|calendar|event|meeting|free|busy|block.*time|book|appoint|invite|slot|availab/i, groups: ['calendar', 'contacts', 'vault'] },
  // Email — include drive for attachments, tasks for follow-up actions
  { pattern: /email|e-mail|mail|draft|send|inbox|reply|compose|gmail|forward|cc\b|bcc/i, groups: ['email', 'contacts', 'drive', 'tasks'] },
  // Tasks — include calendar (task↔event ambiguity: "move task to 2pm") and contacts
  { pattern: /\btask|todo|to.do|to-do|action.?item|remind|checklist|due\b|overdue|complete.*task/i, groups: ['tasks', 'calendar', 'contacts'] },
  // Drive — include vault for organization context
  { pattern: /drive|upload|download|folder|document|pdf|sheet|doc\b|slide|presentation|spreadsheet|google.?doc/i, groups: ['drive', 'vault'] },
  // Contacts
  { pattern: /contact|who is|find.*email|look.*up.*person|attendee|phone|number for/i, groups: ['contacts'] },
  // Vault/notes — include tasks for project task context
  { pattern: /\bnote|vault|obsidian|project|daily|journal|search.*vault|write.*note|read.*note|meeting.?note/i, groups: ['vault', 'tasks'] },
  // Daily briefing — include email for inbox summary
  { pattern: /brief|morning|daily brief|what.*today|my day|my plate|agenda|summary.*day/i, groups: ['agents', 'calendar', 'tasks', 'email', 'vault'] },
  // Research
  { pattern: /research|analy[sz]|compar|evaluat|investig|market.*size|competitive/i, groups: ['agents'] },
  // Project management — include calendar and email for full project context
  { pattern: /create.*project|new.*project|start.*project|project.*status|update.*project/i, groups: ['vault', 'tasks', 'calendar', 'email'] },
  // Status/overview — include vault and email for full picture
  { pattern: /what.*schedul|what.*pending|status|overview|what.*happening|catch.*up/i, groups: ['calendar', 'tasks', 'vault', 'email'] },
  // Files/attachments — include email for attachment context
  { pattern: /\bfile|attachment|transcript|report\b/i, groups: ['vault', 'drive', 'email'] },
  // Review/retrospective — look back at recent work
  { pattern: /review|retrospect|recap|debrief|wrap.?up|last week|this week|progress/i, groups: ['vault', 'calendar', 'tasks', 'email'] },
  // Move/reschedule — ambiguous between tasks and calendar
  { pattern: /\bmove\b|reschedul|postpon|push.*back|bring.*forward|defer/i, groups: ['tasks', 'calendar'] },
];

/** Route message to relevant tools (typically 3-8 instead of 29) */
export function routeTools(message: string): ToolParam[] {
  const matchedGroups = new Set<string>();

  for (const route of ROUTE_PATTERNS) {
    if (route.pattern.test(message)) {
      for (const group of route.groups) {
        matchedGroups.add(group);
      }
    }
  }

  // No keyword match → default set (calendar + tasks + vault covers most queries)
  if (matchedGroups.size === 0) {
    matchedGroups.add('calendar');
    matchedGroups.add('tasks');
    matchedGroups.add('vault');
  }

  const toolNames = new Set<string>();
  for (const group of matchedGroups) {
    for (const name of TOOL_GROUPS[group]) {
      toolNames.add(name);
    }
  }

  return TOOL_DEFS.filter(t => toolNames.has(t.name));
}
