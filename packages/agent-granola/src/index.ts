/**
 * LifeOS Agent: Granola Post-Meeting Automation
 *
 * Receives Granola meeting webhooks (via Zapier) and:
 * 1. Saves transcript to vault
 * 2. Saves AI summary to project note
 * 3. Extracts and creates tasks
 * 4. Drafts recap email
 * 5. Detects scheduling language → suggests calendar invites
 * 6. Generates suggested actions for daily note
 *
 * Trigger: POST /webhook (Zapier sends Granola meeting data)
 * Also: POST /process (manual trigger with meeting ID)
 */

import express from 'express';
import crypto from 'crypto';
import 'dotenv/config';

import {
  writeFile,
  appendToFile,
  readFile,
  readDailyNote,
  writeDailyNote,
  loadConfig,
  detectProject,
  resolveAccount,
  isAutoExecute,
  resolveProjectPathCached,
  buildProjectMeetingNotesPath,
  VAULT_PATHS,
  isVaultConfigured,
} from '@lifeos/shared';
import type { MeetingData, SuggestedAction } from '@lifeos/shared';
import { extractActions } from './extract-actions.js';
import { draftRecapEmail } from './draft-email.js';
import { detectSchedulingLanguage } from './detect-scheduling.js';
import { generateSuggestedActions } from './suggested-actions.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

// ─── Health Check ────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'lifeos-agent-granola' });
});

// ─── Webhook Endpoint (Zapier → Cloud Run) ───────────────

app.post('/webhook', async (req, res) => {
  try {
    // Verify webhook secret (optional but recommended)
    const secret = process.env.ZAPIER_WEBHOOK_SECRET;
    if (secret) {
      const signature = req.headers['x-webhook-secret'];
      if (signature !== secret) {
        console.warn('[granola] Invalid webhook secret');
        res.status(401).json({ error: 'Invalid webhook secret' });
        return;
      }
    }

    const meetingData = parseMeetingData(req.body);
    console.log(`[granola] Processing meeting: "${meetingData.title}" (${meetingData.date})`);

    const results = await processMeeting(meetingData);

    res.json({
      status: 'ok',
      meeting: meetingData.title,
      results,
    });
  } catch (error: any) {
    console.error('[granola] Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Manual Trigger ──────────────────────────────────────

app.post('/process', async (req, res) => {
  try {
    const meetingData = req.body as MeetingData;

    if (!meetingData.title || !meetingData.transcript) {
      res.status(400).json({ error: 'Missing required fields: title, transcript' });
      return;
    }

    const results = await processMeeting(meetingData);
    res.json({ status: 'ok', results });
  } catch (error: any) {
    console.error('[granola] Process error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Main Processing Pipeline ────────────────────────────

interface ProcessingResults {
  transcriptSaved: boolean;
  summarySaved: boolean;
  projectUpdated: string | null;
  tasksCreated: number;
  draftCreated: boolean;
  schedulingDetected: boolean;
  suggestedActions: number;
}

async function processMeeting(meeting: MeetingData): Promise<ProcessingResults> {
  const config = loadConfig();
  const results: ProcessingResults = {
    transcriptSaved: false,
    summarySaved: false,
    projectUpdated: null,
    tasksCreated: 0,
    draftCreated: false,
    schedulingDetected: false,
    suggestedActions: 0,
  };

  // Detect which project this meeting belongs to
  const project = detectProject(config, meeting.attendees, meeting.title);
  const dateSlug = meeting.date.split('T')[0];
  const titleSlug = meeting.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // ── Step 1–3: Vault writes (transcript, summary, project note) ──
  if (isVaultConfigured()) {
    // Step 1: Save transcript
    try {
      const transcriptPath = `Files/Meetings/${dateSlug}-${titleSlug}-transcript.md`;
      const transcriptContent = `---
title: "${meeting.title}"
date: ${meeting.date}
attendees: [${meeting.attendees.map(a => `"${a}"`).join(', ')}]
source: ${meeting.source}
---

# ${meeting.title} — Transcript

**Date:** ${meeting.date}
**Attendees:** ${meeting.attendees.join(', ')}

---

${meeting.transcript}
`;
      await writeFile(transcriptPath, transcriptContent, `Transcript: ${meeting.title}`);
      results.transcriptSaved = true;
      console.log(`[granola] Transcript saved: ${transcriptPath}`);
    } catch (error) {
      console.error('[granola] Failed to save transcript:', error);
    }

    // Step 2: Save summary
    try {
      const summaryPath = `Files/Meetings/${dateSlug}-${titleSlug}-summary.md`;
      const summaryContent = `---
title: "${meeting.title}"
date: ${meeting.date}
attendees: [${meeting.attendees.map(a => `"${a}"`).join(', ')}]
type: summary
---

# ${meeting.title} — Summary

**Date:** ${meeting.date}
**Attendees:** ${meeting.attendees.join(', ')}

---

${meeting.summary}
`;
      await writeFile(summaryPath, summaryContent, `Summary: ${meeting.title}`);
      results.summarySaved = true;
      console.log(`[granola] Summary saved: ${summaryPath}`);
    } catch (error) {
      console.error('[granola] Failed to save summary:', error);
    }

    // Step 3: Update project note
    if (project) {
      try {
        const folderPath = await resolveProjectPathCached(project);
        const projectPath = folderPath
          ? `${folderPath}/README.md`
          : `${VAULT_PATHS.projects}/${project}.md`;

        const existing = await readFile(projectPath);

        const transcriptLink = `Files/Meetings/${dateSlug}-${titleSlug}-transcript.md`;
        const summaryLink = `Files/Meetings/${dateSlug}-${titleSlug}-summary.md`;
        const meetingRef = `\n- **${meeting.date.split('T')[0]}** — ${meeting.title} ([[${transcriptLink}|transcript]] | [[${summaryLink}|summary]])`;

        if (existing) {
          await appendToFile(projectPath, meetingRef, `Meeting: ${meeting.title}`);
          results.projectUpdated = project;
          console.log(`[granola] Project note updated: ${projectPath}`);
        }

        if (folderPath) {
          const meetingNotesPath = buildProjectMeetingNotesPath(folderPath);
          await appendToFile(meetingNotesPath, meetingRef, `Meeting: ${meeting.title}`);
          console.log(`[granola] Meeting notes updated: ${meetingNotesPath}`);
        }
      } catch (error) {
        console.error('[granola] Failed to update project note:', error);
      }
    }
  } else {
    console.log('[granola] Vault not configured — skipping vault writes');
  }

  // ── Step 4: Extract and create tasks ─────────────────────
  try {
    const actions = await extractActions(meeting);
    results.tasksCreated = actions.length;
    console.log(`[granola] Extracted ${actions.length} action items`);
  } catch (error) {
    console.error('[granola] Failed to extract actions:', error);
  }

  // ── Step 5: Draft recap email ────────────────────────────
  try {
    const drafted = await draftRecapEmail(meeting, project);
    results.draftCreated = drafted;
    if (drafted) {
      console.log(`[granola] Recap email drafted`);
    }
  } catch (error) {
    console.error('[granola] Failed to draft recap email:', error);
  }

  // ── Step 6: Detect scheduling language ───────────────────
  try {
    const scheduling = detectSchedulingLanguage(meeting.transcript);
    results.schedulingDetected = scheduling.length > 0;
    if (scheduling.length > 0) {
      console.log(`[granola] Detected ${scheduling.length} scheduling request(s)`);
    }
  } catch (error) {
    console.error('[granola] Failed to detect scheduling:', error);
  }

  // ── Step 7: Generate suggested actions ───────────────────
  try {
    const suggested = await generateSuggestedActions(meeting, project, results);
    results.suggestedActions = suggested.length;

    // Append suggested actions to daily note (vault required)
    if (suggested.length > 0 && isVaultConfigured()) {
      await appendSuggestedActionsToDaily(suggested, dateSlug);
    }
  } catch (error) {
    console.error('[granola] Failed to generate suggested actions:', error);
  }

  console.log(`[granola] Processing complete for "${meeting.title}":`, results);
  return results;
}

// ─── Helpers ─────────────────────────────────────────────

function parseMeetingData(body: any): MeetingData {
  // Zapier sends Granola data in various formats — normalize here
  return {
    id: body.id ?? body.meeting_id ?? crypto.randomUUID(),
    title: body.title ?? body.meeting_title ?? 'Untitled Meeting',
    date: body.date ?? body.meeting_date ?? new Date().toISOString(),
    attendees: parseAttendees(body.attendees ?? body.participants ?? []),
    transcript: body.transcript ?? body.meeting_transcript ?? '',
    summary: body.summary ?? body.meeting_summary ?? body.notes ?? '',
    source: 'granola',
  };
}

function parseAttendees(input: any): string[] {
  if (Array.isArray(input)) {
    return input.map((a) => typeof a === 'string' ? a : a.email ?? a.name ?? '');
  }
  if (typeof input === 'string') {
    return input.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

async function appendSuggestedActionsToDaily(
  actions: SuggestedAction[],
  dateSlug: string
): Promise<void> {
  const actionsText = `\n\n## Suggested Actions (from meeting)\n\n` +
    actions.map((a) => {
      const risk = a.autoExecute ? '🟢 auto' : '🟡 review';
      return `- [${risk}] ${a.description}`;
    }).join('\n');

  const dailyPath = `${VAULT_PATHS.daily}/${dateSlug}.md`;
  const existing = await readDailyNote(dateSlug);

  if (existing) {
    await appendToFile(dailyPath, actionsText, `Suggested actions from meeting`);
  } else {
    // Create a minimal daily note with the actions
    const content = `# ${dateSlug}\n${actionsText}`;
    await writeDailyNote(content, dateSlug);
  }
}

// ─── Start Server ────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3003', 10);
app.listen(port, () => {
  console.log(`[agent-granola] Listening on port ${port}`);
});
