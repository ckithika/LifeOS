/**
 * LifeOS Agent: Drive Organizer
 *
 * Keeps Google Drive organized by:
 * 1. Classifying unfiled documents into project folders
 * 2. Maintaining a standard folder structure
 * 3. Flagging duplicates and outdated files
 * 4. One-time deep cleanup (manual trigger)
 *
 * Trigger: Cloud Scheduler → POST /organize (daily at 7am EAT)
 * Manual: POST /cleanup?account=<alias> (one-time deep cleanup)
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import {
  getGoogleClients,
  getAllAccountClients,
  loadConfig,
  writeFile,
  appendToFile,
  VAULT_PATHS,
} from '@lifeos/shared';

const app = express();
app.use(express.json());

const anthropic = new Anthropic();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'lifeos-agent-drive-org' });
});

// ─── Daily Organize ──────────────────────────────────────

app.post('/organize', async (req, res) => {
  console.log('[drive-org] Starting daily organization');

  try {
    const results = await dailyOrganize();
    res.json({ status: 'ok', results });
  } catch (error: any) {
    console.error('[drive-org] Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── One-Time Cleanup ────────────────────────────────────

app.post('/cleanup', async (req, res) => {
  const account = req.query.account as string;
  if (!account) {
    res.status(400).json({ error: 'Missing ?account=<alias> parameter' });
    return;
  }

  console.log(`[drive-org] Starting deep cleanup for ${account}`);

  try {
    const report = await deepCleanup(account);
    res.json({ status: 'ok', account, report });
  } catch (error: any) {
    console.error('[drive-org] Cleanup failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Daily Organization Logic ────────────────────────────

interface OrganizeResult {
  account: string;
  filesScanned: number;
  filesClassified: number;
  filesMoved: number;
  errors: string[];
}

async function dailyOrganize(): Promise<OrganizeResult[]> {
  const allClients = getAllAccountClients();
  const results: OrganizeResult[] = [];

  for (const [alias, clients] of allClients) {
    const result: OrganizeResult = {
      account: alias,
      filesScanned: 0,
      filesClassified: 0,
      filesMoved: 0,
      errors: [],
    };

    try {
      // Find files in root (unfiled) modified in last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Get root folder ID
      const rootResponse = await clients.drive.files.get({
        fileId: 'root',
        fields: 'id',
      });
      const rootId = rootResponse.data.id;

      const response = await clients.drive.files.list({
        q: `'${rootId}' in parents and modifiedTime > '${oneDayAgo}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        pageSize: 50,
        fields: 'files(id, name, mimeType, size, modifiedTime, description)',
        orderBy: 'modifiedTime desc',
      });

      const unfiledFiles = response.data.files ?? [];
      result.filesScanned = unfiledFiles.length;

      if (unfiledFiles.length === 0) {
        console.log(`[drive-org] ${alias}: No unfiled files in last 24h`);
        results.push(result);
        continue;
      }

      // Classify files using AI
      const classifications = await classifyFiles(
        unfiledFiles.map((f) => ({
          name: f.name ?? '',
          mimeType: f.mimeType ?? '',
          description: f.description ?? '',
        }))
      );

      result.filesClassified = classifications.length;

      // Ensure target folders exist and move files
      for (let i = 0; i < unfiledFiles.length && i < classifications.length; i++) {
        const file = unfiledFiles[i];
        const classification = classifications[i];

        if (!classification.folder || classification.folder === 'root') continue;

        try {
          // Find or create the target folder
          const folderId = await ensureFolder(clients.drive, classification.folder);

          // Move the file
          await clients.drive.files.update({
            fileId: file.id!,
            addParents: folderId,
            removeParents: rootId!,
            fields: 'id, parents',
          });

          result.filesMoved++;
          console.log(`[drive-org] ${alias}: Moved "${file.name}" → ${classification.folder}`);
        } catch (moveError: any) {
          result.errors.push(`Move ${file.name}: ${moveError.message}`);
        }
      }
    } catch (error: any) {
      result.errors.push(error.message);
    }

    results.push(result);
  }

  // Log results to vault
  const logEntry = `\n## Drive Organize — ${new Date().toISOString()}\n\n` +
    results.map((r) =>
      `**${r.account}**: Scanned ${r.filesScanned}, classified ${r.filesClassified}, moved ${r.filesMoved}${r.errors.length > 0 ? ` (${r.errors.length} errors)` : ''}`
    ).join('\n') + '\n';

  await appendToFile(VAULT_PATHS.syncLog, logEntry, 'Drive organize log');

  return results;
}

// ─── Deep Cleanup ────────────────────────────────────────

interface CleanupReport {
  totalFiles: number;
  byFolder: Record<string, number>;
  duplicates: Array<{ name: string; count: number }>;
  largeFiles: Array<{ name: string; size: number }>;
  suggestions: string[];
}

async function deepCleanup(accountAlias: string): Promise<CleanupReport> {
  const { drive } = getGoogleClients(accountAlias);

  const report: CleanupReport = {
    totalFiles: 0,
    byFolder: {},
    duplicates: [],
    largeFiles: [],
    suggestions: [],
  };

  // Scan all files
  let pageToken: string | undefined;
  const allFiles: Array<{ name: string; id: string; size: number; mimeType: string; parents: string[] }> = [];

  do {
    const response = await drive.files.list({
      q: 'trashed = false',
      pageSize: 200,
      fields: 'nextPageToken, files(id, name, mimeType, size, parents, modifiedTime)',
      pageToken,
    });

    for (const file of response.data.files ?? []) {
      allFiles.push({
        name: file.name ?? '',
        id: file.id ?? '',
        size: file.size ? parseInt(file.size, 10) : 0,
        mimeType: file.mimeType ?? '',
        parents: file.parents ?? [],
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  report.totalFiles = allFiles.length;

  // Find duplicates (same name)
  const nameCount = new Map<string, number>();
  for (const file of allFiles) {
    nameCount.set(file.name, (nameCount.get(file.name) ?? 0) + 1);
  }
  report.duplicates = Array.from(nameCount.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Find large files (> 50MB)
  report.largeFiles = allFiles
    .filter((f) => f.size > 50 * 1024 * 1024)
    .map((f) => ({ name: f.name, size: f.size }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);

  // Generate suggestions
  if (report.duplicates.length > 0) {
    report.suggestions.push(`Found ${report.duplicates.length} duplicate file names — consider consolidating`);
  }
  if (report.largeFiles.length > 0) {
    const totalLarge = report.largeFiles.reduce((sum, f) => sum + f.size, 0);
    report.suggestions.push(`${report.largeFiles.length} files over 50MB (${(totalLarge / 1024 / 1024 / 1024).toFixed(1)} GB total)`);
  }

  // Save report to vault
  const reportContent = `---
type: drive-cleanup-report
account: ${accountAlias}
date: ${new Date().toISOString()}
---

# Drive Cleanup Report: ${accountAlias}

**Total files:** ${report.totalFiles}

## Duplicates (${report.duplicates.length})
${report.duplicates.map((d) => `- "${d.name}" × ${d.count} copies`).join('\n') || 'None found'}

## Large Files (${report.largeFiles.length})
${report.largeFiles.map((f) => `- "${f.name}" (${(f.size / 1024 / 1024).toFixed(1)} MB)`).join('\n') || 'None found'}

## Suggestions
${report.suggestions.map((s) => `- ${s}`).join('\n') || '- Drive looks clean!'}

---
⚠️ **No files have been moved or deleted.** Review this report and approve actions before proceeding.
`;

  await writeFile(
    `Files/Reports/drive-cleanup-${accountAlias}-${new Date().toISOString().split('T')[0]}.md`,
    reportContent,
    `Drive cleanup report: ${accountAlias}`
  );

  console.log(`[drive-org] Cleanup report saved for ${accountAlias}: ${report.totalFiles} files scanned`);
  return report;
}

// ─── AI Classification ──────────────────────────────────

interface FileClassification {
  folder: string;
  confidence: number;
}

async function classifyFiles(
  files: Array<{ name: string; mimeType: string; description: string }>
): Promise<FileClassification[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return files.map(() => ({ folder: 'root', confidence: 0 }));
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You classify files into folders. Return ONLY a JSON array with one entry per file. Each entry has: folder (string, suggested folder name like "Finance", "Projects", "Personal", "Work", "Templates", "Archive", or "root" if unclear), confidence (number 0-1). Use common folder names. Keep it simple.`,
      messages: [{
        role: 'user',
        content: `Classify these files:\n${files.map((f, i) => `${i + 1}. "${f.name}" (${f.mimeType})`).join('\n')}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('[drive-org] AI classification failed:', error);
    return files.map(() => ({ folder: 'root', confidence: 0 }));
  }
}

// ─── Folder Management ──────────────────────────────────

/** Cache of folder name → folder ID */
const folderCache = new Map<string, string>();

async function ensureFolder(drive: any, folderName: string): Promise<string> {
  const cached = folderCache.get(folderName);
  if (cached) return cached;

  // Check if folder exists
  const existing = await drive.files.list({
    q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    pageSize: 1,
    fields: 'files(id)',
  });

  if (existing.data.files?.length) {
    const id = existing.data.files[0].id!;
    folderCache.set(folderName, id);
    return id;
  }

  // Create folder
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  const id = created.data.id!;
  folderCache.set(folderName, id);
  return id;
}

// ─── Start Server ────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3006', 10);
app.listen(port, () => {
  console.log(`[agent-drive-org] Listening on port ${port}`);
});
