/**
 * LifeOS Agent: Background Sync
 *
 * Synchronizes data from all Google accounts into the Obsidian vault.
 * Runs on a schedule (3x daily) or on-demand.
 *
 * Modes:
 * - full: Sync Gmail, Calendar, Tasks, and files (default)
 * - files: File-only sync (Drive → vault, attachments)
 *
 * Trigger: Cloud Scheduler → POST /sync
 */

import express from 'express';
import 'dotenv/config';

import {
  getAllAccountClients,
  writeFile,
  appendToFile,
  VAULT_PATHS,
  MAX_SYNC_SIZE_BYTES,
  GOOGLE_DOCS_EXPORT,
} from '@lifeos/shared';

const app = express();
app.use(express.json());

// ─── Health Check ────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'lifeos-agent-sync' });
});

// ─── Sync Endpoint ───────────────────────────────────────

app.post('/sync', async (req, res) => {
  const mode = (req.query.mode as string) ?? 'full';
  console.log(`[sync] Starting ${mode} sync at ${new Date().toISOString()}`);

  try {
    const results = mode === 'files'
      ? await syncFiles()
      : await fullSync();

    // Update sync log
    await updateSyncLog(results);

    res.json({ status: 'ok', mode, results });
  } catch (error: any) {
    console.error('[sync] Sync failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Full Sync ───────────────────────────────────────────

interface SyncResults {
  accounts: Record<string, {
    emails: number;
    events: number;
    tasks: number;
    files: number;
    errors: string[];
  }>;
  timestamp: string;
}

async function fullSync(): Promise<SyncResults> {
  const allClients = getAllAccountClients();
  const results: SyncResults = {
    accounts: {},
    timestamp: new Date().toISOString(),
  };

  for (const [alias, clients] of allClients) {
    const accountResults = {
      emails: 0,
      events: 0,
      tasks: 0,
      files: 0,
      errors: [] as string[],
    };

    // ── Gmail: Check for unread/important emails ──────────
    try {
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread newer_than:1d',
        maxResults: 20,
      });

      accountResults.emails = response.data.resultSizeEstimate ?? 0;
      console.log(`[sync] ${alias}: ${accountResults.emails} unread emails (last 24h)`);
    } catch (error: any) {
      accountResults.errors.push(`Gmail: ${error.message}`);
    }

    // ── Calendar: Upcoming events ────────────────────────
    try {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: tomorrow.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      accountResults.events = response.data.items?.length ?? 0;
      console.log(`[sync] ${alias}: ${accountResults.events} upcoming events (next 24h)`);
    } catch (error: any) {
      accountResults.errors.push(`Calendar: ${error.message}`);
    }

    // ── Tasks: Active tasks ──────────────────────────────
    try {
      const response = await clients.tasks.tasks.list({
        tasklist: '@default',
        showCompleted: false,
        maxResults: 100,
      });

      accountResults.tasks = response.data.items?.length ?? 0;
      console.log(`[sync] ${alias}: ${accountResults.tasks} active tasks`);
    } catch (error: any) {
      accountResults.errors.push(`Tasks: ${error.message}`);
    }

    results.accounts[alias] = accountResults;
  }

  // Also sync files
  const fileResults = await syncFiles();
  for (const [alias, fr] of Object.entries(fileResults.accounts)) {
    if (results.accounts[alias]) {
      results.accounts[alias].files = fr.files;
      results.accounts[alias].errors.push(...fr.errors);
    }
  }

  return results;
}

// ─── File Sync ───────────────────────────────────────────

async function syncFiles(): Promise<SyncResults> {
  const allClients = getAllAccountClients();
  const results: SyncResults = {
    accounts: {},
    timestamp: new Date().toISOString(),
  };

  for (const [alias, clients] of allClients) {
    const accountResults = {
      emails: 0,
      events: 0,
      tasks: 0,
      files: 0,
      errors: [] as string[],
    };

    // ── Sync recent Drive files modified in last 4 hours ──
    try {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      const response = await clients.drive.files.list({
        q: `modifiedTime > '${fourHoursAgo}' and trashed = false`,
        pageSize: 50,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        orderBy: 'modifiedTime desc',
      });

      for (const file of response.data.files ?? []) {
        const fileSize = file.size ? parseInt(file.size, 10) : 0;
        const mimeType = file.mimeType ?? '';

        // Skip files that are too large
        if (fileSize > MAX_SYNC_SIZE_BYTES) {
          console.log(`[sync] Skipping large file: ${file.name} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
          continue;
        }

        // Determine project folder from Drive parents
        const projectFolder = await resolveProjectFolder(clients.drive, file.parents?.[0]);

        try {
          // Export Google Docs to Markdown, Sheets to CSV, etc.
          const exportConfig = GOOGLE_DOCS_EXPORT[mimeType];
          if (exportConfig) {
            const exported = await clients.drive.files.export({
              fileId: file.id!,
              mimeType: exportConfig.mimeType,
            }, { responseType: 'text' });

            const vaultPath = `Files/${projectFolder}/${file.name}${exportConfig.extension}`;
            await writeFile(vaultPath, exported.data as string, `Sync: ${file.name}`);
            accountResults.files++;
          }
          // For regular text files, download directly
          else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
            const content = await clients.drive.files.get({
              fileId: file.id!,
              alt: 'media',
            }, { responseType: 'text' });

            const vaultPath = `Files/${projectFolder}/${file.name}`;
            await writeFile(vaultPath, content.data as string, `Sync: ${file.name}`);
            accountResults.files++;
          }
          // Skip binary files for now (could save as link reference)
        } catch (fileError: any) {
          console.warn(`[sync] Failed to sync file ${file.name}:`, fileError.message);
        }
      }

      console.log(`[sync] ${alias}: Synced ${accountResults.files} files`);
    } catch (error: any) {
      accountResults.errors.push(`Drive files: ${error.message}`);
    }

    // ── Sync email attachments from today ────────────────
    try {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: `has:attachment after:${today}`,
        maxResults: 10,
      });

      for (const msg of response.data.messages ?? []) {
        if (!msg.id) continue;

        const detail = await clients.gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'full',
        });

        const parts = detail.data.payload?.parts ?? [];
        for (const part of parts) {
          if (!part.filename || !part.body?.attachmentId) continue;
          if ((part.body?.size ?? 0) > MAX_SYNC_SIZE_BYTES) continue;

          try {
            const attachment = await clients.gmail.users.messages.attachments.get({
              userId: 'me',
              messageId: msg.id,
              id: part.body.attachmentId,
            });

            if (attachment.data.data) {
              const content = Buffer.from(attachment.data.data, 'base64').toString('utf-8');
              const vaultPath = `Files/Inbox/${part.filename}`;
              await writeFile(vaultPath, content, `Attachment: ${part.filename}`);
              accountResults.files++;
            }
          } catch {
            // Skip binary attachments that can't be stored as text
          }
        }
      }
    } catch (error: any) {
      accountResults.errors.push(`Attachments: ${error.message}`);
    }

    results.accounts[alias] = accountResults;
  }

  return results;
}

// ─── Sync Log ────────────────────────────────────────────

async function updateSyncLog(results: SyncResults): Promise<void> {
  try {
    const logContent = `## Sync — ${results.timestamp}

| Account | Emails | Events | Tasks | Files | Errors |
|---------|--------|--------|-------|-------|--------|
${Object.entries(results.accounts).map(([alias, r]) =>
  `| ${alias} | ${r.emails} | ${r.events} | ${r.tasks} | ${r.files} | ${r.errors.length > 0 ? r.errors.join('; ') : '✅'} |`
).join('\n')}

---
`;

    await appendToFile(VAULT_PATHS.syncLog, logContent, `Sync log: ${results.timestamp}`);
    console.log(`[sync] Log updated at ${VAULT_PATHS.syncLog}`);
  } catch (error) {
    console.error('[sync] Failed to update sync log:', error);
  }
}

// ─── Helpers ─────────────────────────────────────────────

async function resolveProjectFolder(drive: any, parentId?: string): Promise<string> {
  if (!parentId) return 'Inbox';

  try {
    const parent = await drive.files.get({
      fileId: parentId,
      fields: 'name',
    });
    // Use the Drive folder name as project folder
    return parent.data.name ?? 'Inbox';
  } catch {
    return 'Inbox';
  }
}

// ─── Start Server ────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3004', 10);
app.listen(port, () => {
  console.log(`[agent-sync] Listening on port ${port}`);
});
