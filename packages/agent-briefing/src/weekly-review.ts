/**
 * Weekly review generator
 *
 * Summarizes past 7 days: calendar events, completed tasks,
 * daily notes, goal progress, projects touched, email activity.
 * Writes to Files/Reports/weekly-{date}.md
 */

import {
  getAllAccountClients,
  listProjects,
  readFile,
  writeFile,
  sendTelegramMessage,
  parseGoals,
  formatGoalsSummary,
  isVaultConfigured,
} from '@lifeos/shared';

export interface WeeklyReviewResult {
  eventsCount: number;
  tasksCompleted: number;
  emailsSent: number;
  reportPath: string;
}

export async function generateWeeklyReview(
  endDate?: string,
): Promise<WeeklyReviewResult> {
  const end = endDate || new Date().toISOString().split('T')[0];
  const endDt = new Date(end + 'T23:59:59+03:00');
  const startDt = new Date(endDt.getTime() - 7 * 24 * 60 * 60 * 1000);
  const start = startDt.toISOString().split('T')[0];

  const allClients = getAllAccountClients();
  const sections: string[] = [];

  // ── Calendar events ──────────────────────────────────
  let eventsCount = 0;
  const eventLines: string[] = [];

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.calendar.events.list({
        calendarId: 'primary',
        timeMin: `${start}T00:00:00+03:00`,
        timeMax: `${end}T23:59:59+03:00`,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 100,
      });

      for (const event of response.data.items ?? []) {
        eventsCount++;
        const date = (event.start?.dateTime || event.start?.date || '').split('T')[0];
        eventLines.push(`- ${date} **${event.summary || '(No title)'}** (${alias})`);
      }
    } catch (error: any) {
      console.warn(`[weekly] Calendar error for ${alias}:`, error.message);
    }
  }

  sections.push('## Calendar\n' +
    (eventLines.length > 0
      ? `${eventsCount} events this week:\n${eventLines.join('\n')}`
      : 'No events'));

  // ── Completed tasks ──────────────────────────────────
  let tasksCompleted = 0;
  const taskLines: string[] = [];

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.tasks.tasks.list({
        tasklist: '@default',
        showCompleted: true,
        completedMin: startDt.toISOString(),
        maxResults: 50,
      });

      for (const task of response.data.items ?? []) {
        if (task.status === 'completed') {
          tasksCompleted++;
          taskLines.push(`- [x] ${task.title || '(No title)'} (${alias})`);
        }
      }
    } catch (error: any) {
      console.warn(`[weekly] Tasks error for ${alias}:`, error.message);
    }
  }

  sections.push('## Tasks Completed\n' +
    (taskLines.length > 0
      ? `${tasksCompleted} tasks:\n${taskLines.join('\n')}`
      : 'No tasks completed'));

  // ── Email activity ───────────────────────────────────
  let emailsSent = 0;

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.gmail.users.messages.list({
        userId: 'me',
        q: `in:sent after:${start} before:${end}`,
        maxResults: 1,
      });
      emailsSent += response.data.resultSizeEstimate ?? 0;
    } catch (error: any) {
      console.warn(`[weekly] Gmail error for ${alias}:`, error.message);
    }
  }

  sections.push(`## Email Activity\n- ~${emailsSent} emails sent`);

  // ── Daily notes ──────────────────────────────────────
  if (isVaultConfigured()) {
    const dailyNoteLines: string[] = [];
    const current = new Date(startDt);
    while (current <= endDt) {
      const dateStr = current.toISOString().split('T')[0];
      try {
        const note = await readFile(`Daily/${dateStr}.md`);
        if (note) {
          dailyNoteLines.push(`- [[Daily/${dateStr}]]`);
        }
      } catch {
        // Skip missing days
      }
      current.setDate(current.getDate() + 1);
    }

    if (dailyNoteLines.length > 0) {
      sections.push('## Daily Notes\n' + dailyNoteLines.join('\n'));
    }

    // ── Goals ────────────────────────────────────────────
    try {
      const goalsFile = await readFile('Areas/Personal/goals.md');
      if (goalsFile) {
        const goals = parseGoals(goalsFile.content);
        const summary = formatGoalsSummary(goals)
          .replace(/<\/?b>/g, '**')
          .replace(/<\/?i>/g, '*');
        sections.push('## Goal Progress\n' + summary);
      }
    } catch {
      // Goals file may not exist
    }

    // ── Active projects ──────────────────────────────────
    try {
      const projects = await listProjects();
      const active = projects.filter(p => p.status === 'active');
      if (active.length > 0) {
        sections.push('## Active Projects\n' +
          active.map(p => `- [[${p.path}|${p.title}]]${p.category ? ` [${p.category}]` : ''}`).join('\n'));
      }
    } catch {
      // Project listing is best-effort
    }
  }

  // ── Assemble report ──────────────────────────────────
  const reportPath = `Files/Reports/weekly-${end}.md`;
  const report = `---
type: weekly-review
period: ${start} to ${end}
generated: ${new Date().toISOString()}
---

# Weekly Review: ${start} — ${end}

${sections.join('\n\n')}

---
*Generated at ${new Date().toLocaleTimeString('en-KE')} EAT*
`;

  if (isVaultConfigured()) {
    await writeFile(reportPath, report, `lifeos: weekly review ${end}`);
    console.log(`[weekly] Report written to ${reportPath}`);
  } else {
    console.log(`[weekly] Vault not configured — skipping report write`);
  }

  // Send summary to Telegram
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (chatId) {
    const summary = [
      `<b>Weekly Review: ${start} — ${end}</b>`,
      '',
      `Events: ${eventsCount}`,
      `Tasks completed: ${tasksCompleted}`,
      `Emails sent: ~${emailsSent}`,
      '',
      `Full report: ${reportPath}`,
    ].join('\n');

    await sendTelegramMessage(chatId, summary, { parse_mode: 'HTML' });
  }

  return { eventsCount, tasksCompleted, emailsSent, reportPath };
}
