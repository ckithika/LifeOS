/**
 * LifeOS Agent: Daily Briefing
 *
 * Generates a daily note in the vault with:
 * - Today's calendar events (all accounts)
 * - Active tasks and deadlines
 * - Unread/important emails
 * - Recent meeting summaries
 * - Follow-up reminders (unanswered emails, overdue tasks)
 * - Suggested actions from yesterday
 *
 * Trigger: Cloud Scheduler → POST /briefing (daily at 6:30am EAT)
 */

import express from 'express';
import 'dotenv/config';

import {
  getAllAccountClients,
  loadConfig,
  writeDailyNote,
  listProjects,
} from '@lifeos/shared';
import type { CalendarEvent, TaskItem } from '@lifeos/shared';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'lifeos-agent-briefing' });
});

// ─── Briefing Endpoint ───────────────────────────────────

app.post('/briefing', async (req, res) => {
  const date = (req.query.date as string) ?? new Date().toISOString().split('T')[0];
  console.log(`[briefing] Generating briefing for ${date}`);

  try {
    const briefing = await generateBriefing(date);
    res.json({ status: 'ok', date, sections: Object.keys(briefing) });
  } catch (error: any) {
    console.error('[briefing] Failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Generate Briefing ──────────────────────────────────

interface BriefingSections {
  calendar: string;
  tasks: string;
  emails: string;
  followUps: string;
  projects: string;
}

async function generateBriefing(date: string): Promise<BriefingSections> {
  const config = loadConfig();
  const allClients = getAllAccountClients();
  const sections: BriefingSections = {
    calendar: '',
    tasks: '',
    emails: '',
    followUps: '',
    projects: '',
  };

  // ── Calendar: Today's events ───────────────────────────
  const events: CalendarEvent[] = [];
  const dayStart = `${date}T00:00:00+03:00`;
  const dayEnd = `${date}T23:59:59+03:00`;

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: dayStart,
        timeMax: dayEnd,
        singleEvents: true,
        orderBy: 'startTime',
      });

      for (const event of response.data.items ?? []) {
        events.push({
          id: event.id ?? '',
          summary: event.summary ?? '(No title)',
          description: event.description ?? undefined,
          start: event.start?.dateTime ?? event.start?.date ?? '',
          end: event.end?.dateTime ?? event.end?.date ?? '',
          location: event.location ?? undefined,
          attendees: (event.attendees ?? []).map((a) => ({
            email: a.email ?? '',
            displayName: a.displayName ?? undefined,
            responseStatus: a.responseStatus as any,
          })),
          status: event.status ?? 'confirmed',
          account: alias,
          calendarId: 'primary',
        });
      }
    } catch (error: any) {
      console.warn(`[briefing] Calendar error for ${alias}:`, error.message);
    }
  }

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  sections.calendar = events.length > 0
    ? events.map((e) => {
        const start = new Date(e.start);
        const time = e.start.includes('T')
          ? start.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
          : 'All day';
        const attendees = e.attendees?.length
          ? ` — ${e.attendees.map((a) => a.displayName ?? a.email).join(', ')}`
          : '';
        return `- ${time} **${e.summary}** (${e.account})${attendees}`;
      }).join('\n')
    : '- No events scheduled';

  // ── Tasks: Active with deadlines ───────────────────────
  const tasks: TaskItem[] = [];

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.tasks.tasks.list({
        tasklist: '@default',
        showCompleted: false,
        maxResults: 50,
      });

      for (const task of response.data.items ?? []) {
        tasks.push({
          id: task.id ?? '',
          title: task.title ?? '(No title)',
          notes: task.notes ?? undefined,
          due: task.due ?? undefined,
          status: task.status as TaskItem['status'],
          taskListId: '@default',
          account: alias,
        });
      }
    } catch (error: any) {
      console.warn(`[briefing] Tasks error for ${alias}:`, error.message);
    }
  }

  // Sort: overdue first, then by due date
  const today = new Date(date);
  tasks.sort((a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });

  sections.tasks = tasks.length > 0
    ? tasks.map((t) => {
        const dueDate = t.due ? new Date(t.due) : null;
        const isOverdue = dueDate && dueDate < today;
        const dueStr = dueDate
          ? ` (due: ${dueDate.toLocaleDateString('en-KE')}${isOverdue ? ' ⚠️ OVERDUE' : ''})`
          : '';
        return `- ⬜ ${t.title}${dueStr}`;
      }).join('\n')
    : '- No active tasks';

  // ── Emails: Unread summary ─────────────────────────────
  const emailCounts: string[] = [];

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1,
      });

      const count = response.data.resultSizeEstimate ?? 0;
      if (count > 0) {
        emailCounts.push(`- **${alias}**: ${count} unread`);
      }
    } catch (error: any) {
      console.warn(`[briefing] Gmail error for ${alias}:`, error.message);
    }
  }

  sections.emails = emailCounts.length > 0
    ? emailCounts.join('\n')
    : '- All caught up! 🎉';

  // ── Follow-ups: Unanswered emails (3+ days) ───────────
  const followUps: string[] = [];

  for (const [alias, clients] of allClients) {
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: `in:sent older_than:3d -has:userlabels`,
        maxResults: 5,
      });

      // Check if any sent emails have no replies
      for (const msg of response.data.messages ?? []) {
        if (!msg.id || !msg.threadId) continue;

        try {
          const thread = await clients.gmail.users.threads.get({
            userId: 'me',
            id: msg.threadId,
            format: 'minimal',
          });

          // If thread has only 1 message (the sent one), it's unanswered
          if ((thread.data.messages?.length ?? 0) <= 1) {
            const detail = await clients.gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['To', 'Subject', 'Date'],
            });

            const headers = detail.data.payload?.headers ?? [];
            const to = headers.find((h) => h.name === 'To')?.value ?? '';
            const subject = headers.find((h) => h.name === 'Subject')?.value ?? '';
            const sentDate = headers.find((h) => h.name === 'Date')?.value ?? '';

            followUps.push(`- ⏳ **${subject}** → ${to} (sent ${sentDate}, ${alias})`);
          }
        } catch {
          // Skip individual thread errors
        }
      }
    } catch (error: any) {
      console.warn(`[briefing] Follow-up check error for ${alias}:`, error.message);
    }
  }

  sections.followUps = followUps.length > 0
    ? followUps.join('\n')
    : '- No pending follow-ups';

  // ── Projects: Active project status ────────────────────
  try {
    const projects = await listProjects();
    const activeProjects = projects.filter((p) => p.status === 'active');
    sections.projects = activeProjects.length > 0
      ? activeProjects.map((p) => `- [[${p.path}|${p.title}]] [${p.status}]`).join('\n')
      : '- No active projects';
  } catch {
    sections.projects = '- Could not load projects';
  }

  // ── Assemble daily note ────────────────────────────────
  const content = `# ${date}

## 📅 Calendar
${sections.calendar}

## ✅ Tasks
${sections.tasks}

## 📧 Emails
${sections.emails}

## ⏳ Follow-ups
${sections.followUps}

## 📂 Active Projects
${sections.projects}

---
*Generated at ${new Date().toLocaleTimeString('en-KE')} EAT*
`;

  await writeDailyNote(content, date);
  console.log(`[briefing] Daily note written for ${date}`);

  return sections;
}

// ─── Start Server ────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3005', 10);
app.listen(port, () => {
  console.log(`[agent-briefing] Listening on port ${port}`);
});
