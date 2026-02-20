/**
 * /project command — project dashboard
 *
 * /project <name> — shows open tasks, upcoming meetings, recent vault notes, contacts
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  listProjects,
  readFile,
  getAccounts,
  getGoogleClients,
} from '@lifeos/shared';
import { truncateForTelegram } from '../formatting.js';

export async function projectCommand(ctx: Context): Promise<void> {
  const query = ctx.message?.text?.replace(/^\/project\s*/, '').trim();

  if (!query) {
    await ctx.reply(
      'Usage: <code>/project project-name</code>\n\nShows project dashboard with tasks, meetings, and notes.',
      { parse_mode: 'HTML' },
    );
    return;
  }

  try {
    const projects = await listProjects();
    const project = projects.find(
      p =>
        p.slug.toLowerCase() === query.toLowerCase() ||
        p.title.toLowerCase().includes(query.toLowerCase()),
    );

    if (!project) {
      const active = projects.filter(p => p.status === 'active');
      const suggestions = active.slice(0, 5).map(p => `  - <code>${p.slug}</code> (${p.title})`).join('\n');
      await ctx.reply(
        `Project "${query}" not found.\n\nActive projects:\n${suggestions || '(none)'}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const sections: string[] = [];
    sections.push(`<b>${project.title}</b>`);
    if (project.category) sections.push(`<i>${project.category}</i>`);
    sections.push('');

    // Read README for overview
    const readme = await readFile(project.path);
    if (readme) {
      const overviewMatch = readme.content.match(/## Overview\n([\s\S]*?)(?=\n## |$)/);
      if (overviewMatch && overviewMatch[1].trim()) {
        sections.push(`<b>Overview</b>\n${overviewMatch[1].trim().slice(0, 300)}`);
        sections.push('');
      }
    }

    // Upcoming calendar events mentioning this project
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eventLines: string[] = [];

    for (const acct of getAccounts()) {
      try {
        const clients = getGoogleClients(acct.alias);
        const response = await clients.calendar.events.list({
          calendarId: 'primary',
          timeMin: now.toISOString(),
          timeMax: weekLater.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          q: project.title,
          maxResults: 5,
        });

        for (const event of response.data.items ?? []) {
          const start = event.start?.dateTime || event.start?.date || '';
          const date = start.split('T')[0];
          eventLines.push(`  - ${date} ${event.summary || '(No title)'}`);
        }
      } catch {
        // Calendar lookup is best-effort
      }
    }

    if (eventLines.length > 0) {
      sections.push(`<b>Upcoming Meetings</b>\n${eventLines.join('\n')}`);
      sections.push('');
    }

    // Active tasks for this project (search by project name in task notes)
    const taskLines: string[] = [];
    for (const acct of getAccounts()) {
      try {
        const clients = getGoogleClients(acct.alias);
        const response = await clients.tasks.tasks.list({
          tasklist: '@default',
          showCompleted: false,
          maxResults: 20,
        });

        for (const task of response.data.items ?? []) {
          const title = (task.title || '').toLowerCase();
          const notes = (task.notes || '').toLowerCase();
          const slug = project.slug.toLowerCase();
          const name = project.title.toLowerCase();

          if (title.includes(slug) || title.includes(name) || notes.includes(slug) || notes.includes(name)) {
            taskLines.push(`  - ${task.title}`);
          }
        }
      } catch {
        // Task lookup is best-effort
      }
    }

    if (taskLines.length > 0) {
      sections.push(`<b>Open Tasks</b>\n${taskLines.join('\n')}`);
      sections.push('');
    }

    // Project files
    sections.push(`<b>Vault</b>\n  <code>${project.folderPath}</code>`);

    const keyboard = new InlineKeyboard()
      .text('← Projects', 'm:projects')
      .text('← Menu', 'nav:main');

    await ctx.reply(truncateForTelegram(sections.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error: any) {
    console.error('[project] Error:', error.message);
    await ctx.reply(`Could not load project: ${error.message}`);
  }
}
