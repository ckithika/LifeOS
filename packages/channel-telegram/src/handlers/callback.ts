/**
 * Inline keyboard callback router
 */

import type { Context } from 'grammy';
import { getGoogleClients } from '@lifeos/shared';
import { briefingCommand } from '../commands/briefing.js';
import { tasksCommand } from '../commands/tasks.js';
import { scheduleCommand } from '../commands/schedule.js';
import { projectsCommand } from '../commands/projects.js';
import { researchCommand } from '../commands/research.js';
import { goalsCommand } from '../commands/goals.js';
import { projectCommand } from '../commands/project.js';
import { handleExpenseCallback } from './photo.js';

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // Always clear Telegram's loading spinner first
  await ctx.answerCallbackQuery();

  if (data.startsWith('menu:')) {
    await handleMenuCallback(ctx, data.slice(5));
  } else if (data.startsWith('done:')) {
    await handleDoneCallback(ctx, data);
  } else if (data.startsWith('log:')) {
    await handleLogCallback(ctx, data.slice(4));
  } else if (data.startsWith('proj:')) {
    await handleProjectCallback(ctx, data.slice(5));
  } else if (data.startsWith('expok:') || data.startsWith('expcancel:')) {
    await handleExpenseCallback(ctx, data);
  }
}

async function handleMenuCallback(ctx: Context, action: string): Promise<void> {
  switch (action) {
    case 'briefing':
      return briefingCommand(ctx);
    case 'tasks':
      return tasksCommand(ctx);
    case 'schedule':
      return scheduleCommand(ctx);
    case 'projects':
      return projectsCommand(ctx);
    case 'research':
      await ctx.reply('Usage: /research <topic>\n\nExample: /research "grammY vs telegraf comparison"');
      return;
    case 'goals':
      return goalsCommand(ctx);
    case 'note':
      await ctx.reply('Usage: /note <text>\n\nAppends a timestamped note to your daily note.');
      return;
    case 'log':
      await ctx.reply('Usage: /log <category> <value>\n\nCategories: mood, energy, sleep, workout, water, food, weight\n\nExample: /log mood 8');
      return;
    case 'expense':
      await ctx.reply('Usage: /expense <amount> <description>\n\nExample: /expense 500 lunch at Java House');
      return;
    default:
      await ctx.reply(`Unknown menu action: ${action}`);
  }
}

async function handleLogCallback(ctx: Context, category: string): Promise<void> {
  await ctx.reply(`Usage: <code>/log ${category} &lt;value&gt;</code>\n\nExample: <code>/log ${category} ${category === 'mood' ? '8' : category === 'workout' ? 'gym 45min' : '2L'}</code>`, { parse_mode: 'HTML' });
}

async function handleProjectCallback(ctx: Context, slug: string): Promise<void> {
  // Simulate the /project command with this slug
  const fakeCtx = {
    ...ctx,
    message: { ...ctx.message, text: `/project ${slug}` },
  } as Context;
  return projectCommand(fakeCtx);
}

async function handleDoneCallback(ctx: Context, data: string): Promise<void> {
  // Format: done:{taskId}:{accountAlias}
  const parts = data.split(':');
  if (parts.length < 3) {
    await ctx.reply('❌ Invalid task reference.');
    return;
  }

  const taskId = parts[1];
  const account = parts[2];

  try {
    const clients = getGoogleClients(account);
    await clients.tasks.tasks.patch({
      tasklist: '@default',
      task: taskId,
      requestBody: { status: 'completed' },
    });
    await ctx.reply(`✅ Task marked complete!`);
  } catch (error: any) {
    console.error(`[callback] Done error:`, error.message);
    await ctx.reply(`❌ Could not complete task: ${error.message}`);
  }
}
