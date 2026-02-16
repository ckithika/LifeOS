/**
 * grammY Bot configuration — commands, middleware, security
 */

import { Bot } from 'grammy';
import { isAuthorizedUser } from './security.js';
import { helpCommand } from './commands/help.js';
import { briefingCommand } from './commands/briefing.js';
import { tasksCommand } from './commands/tasks.js';
import { scheduleCommand } from './commands/schedule.js';
import { researchCommand } from './commands/research.js';
import { projectsCommand } from './commands/projects.js';
import { handleMessage } from './handlers/message.js';
import { handleCallback } from './handlers/callback.js';

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const bot = new Bot(token);

  // Security middleware — reject unauthorized users
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !isAuthorizedUser(userId)) {
      console.warn(`[bot] Unauthorized access attempt from user ${userId}`);
      await ctx.reply('⛔ Unauthorized. This is a private bot.');
      return;
    }
    await next();
  });

  // Commands
  bot.command('start', helpCommand);
  bot.command('help', helpCommand);
  bot.command('briefing', briefingCommand);
  bot.command('tasks', tasksCommand);
  bot.command('schedule', scheduleCommand);
  bot.command('research', researchCommand);
  bot.command('projects', projectsCommand);

  // Callback queries (inline buttons)
  bot.on('callback_query:data', handleCallback);

  // Free-text messages → Claude AI
  bot.on('message:text', handleMessage);

  // Error handler
  bot.catch((err) => {
    console.error('[bot] Error:', err.message);
  });

  return bot;
}
