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

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  // Always clear Telegram's loading spinner first
  await ctx.answerCallbackQuery();

  if (data.startsWith('menu:')) {
    await handleMenuCallback(ctx, data.slice(5));
  } else if (data.startsWith('done:')) {
    await handleDoneCallback(ctx, data);
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
      // Research needs a topic — show usage prompt
      await ctx.reply('Usage: /research <topic>\n\nExample: /research "grammY vs telegraf comparison"');
      return;
    default:
      await ctx.reply(`Unknown menu action: ${action}`);
  }
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
