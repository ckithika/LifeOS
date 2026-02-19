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
import { noteCommand } from './commands/note.js';
import { logCommand } from './commands/log.js';
import { goalsCommand } from './commands/goals.js';
import { weeklyCommand } from './commands/weekly.js';
import { projectCommand } from './commands/project.js';
import { expenseCommand } from './commands/expense.js';
import { handleMessage } from './handlers/message.js';
import { handleCallback } from './handlers/callback.js';
import { handleVoice } from './handlers/voice.js';
import { handlePhoto } from './handlers/photo.js';

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const bot = new Bot(token);

  // Register "/" command menu in Telegram (fire-and-forget)
  bot.api.setMyCommands([
    { command: 'menu', description: 'Main menu' },
    { command: 'briefing', description: "Today's daily briefing" },
    { command: 'tasks', description: 'Active tasks' },
    { command: 'schedule', description: "Today's calendar" },
    { command: 'projects', description: 'Active projects' },
    { command: 'research', description: 'Research a topic' },
    { command: 'note', description: 'Quick capture to daily note' },
    { command: 'log', description: 'Track habits & mood' },
    { command: 'goals', description: 'View & update goals' },
    { command: 'weekly', description: 'Weekly review' },
    { command: 'project', description: 'Project dashboard' },
    { command: 'expense', description: 'Log an expense' },
    { command: 'help', description: 'Help & commands' },
  ]).catch(err => console.warn('[bot] setMyCommands failed:', err.message));

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
  bot.command('menu', helpCommand);
  bot.command('briefing', briefingCommand);
  bot.command('tasks', tasksCommand);
  bot.command('schedule', scheduleCommand);
  bot.command('research', researchCommand);
  bot.command('projects', projectsCommand);
  bot.command('note', noteCommand);
  bot.command('log', logCommand);
  bot.command('goals', goalsCommand);
  bot.command('weekly', weeklyCommand);
  bot.command('project', projectCommand);
  bot.command('expense', expenseCommand);

  // Callback queries (inline buttons)
  bot.on('callback_query:data', handleCallback);

  // Voice messages → Gemini transcription
  bot.on('message:voice', handleVoice);

  // Photo messages → receipt scanning
  bot.on('message:photo', handlePhoto);

  // Free-text messages → Claude AI
  bot.on('message:text', handleMessage);

  // Error handler
  bot.catch((err) => {
    console.error('[bot] Error:', err.message);
  });

  return bot;
}
