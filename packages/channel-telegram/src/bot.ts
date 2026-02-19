/**
 * grammY Bot configuration — commands, middleware, security
 */

import { Bot } from 'grammy';
import type { Context } from 'grammy';
import { isVaultConfigured } from '@lifeos/shared';
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

// ─── Command Metadata ───────────────────────────────────

interface CommandMeta {
  command: string;
  description: string;
  requiresVault: boolean;
}

const ALL_COMMANDS: CommandMeta[] = [
  { command: 'menu', description: 'Main menu', requiresVault: false },
  { command: 'briefing', description: "Today's daily briefing", requiresVault: false },
  { command: 'tasks', description: 'Active tasks', requiresVault: false },
  { command: 'schedule', description: "Today's calendar", requiresVault: false },
  { command: 'research', description: 'Research a topic', requiresVault: false },
  { command: 'note', description: 'Quick capture to daily note', requiresVault: true },
  { command: 'log', description: 'Track habits & mood', requiresVault: true },
  { command: 'goals', description: 'View & update goals', requiresVault: true },
  { command: 'weekly', description: 'Weekly review', requiresVault: true },
  { command: 'project', description: 'Project dashboard', requiresVault: true },
  { command: 'projects', description: 'Active projects', requiresVault: true },
  { command: 'expense', description: 'Log an expense', requiresVault: true },
  { command: 'help', description: 'Help & commands', requiresVault: false },
];

function getActiveCommands(): Array<{ command: string; description: string }> {
  const vaultOk = isVaultConfigured();
  return ALL_COMMANDS
    .filter(c => vaultOk || !c.requiresVault)
    .map(({ command, description }) => ({ command, description }));
}

/** Wrap a handler so it replies gracefully when vault is not configured. */
function vaultGuard(handler: (ctx: Context) => Promise<void>): (ctx: Context) => Promise<void> {
  return async (ctx) => {
    if (!isVaultConfigured()) {
      await ctx.reply('This command requires the Obsidian vault (GitHub) to be configured. Set GITHUB_PAT, GITHUB_REPO_OWNER, and GITHUB_REPO_NAME in your environment.');
      return;
    }
    return handler(ctx);
  };
}

export function createBot(): Bot {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

  const bot = new Bot(token);

  // Register "/" command menu in Telegram (fire-and-forget)
  bot.api.setMyCommands(getActiveCommands())
    .catch(err => console.warn('[bot] setMyCommands failed:', err.message));

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

  // Commands — always-on
  bot.command('start', helpCommand);
  bot.command('help', helpCommand);
  bot.command('menu', helpCommand);
  bot.command('briefing', briefingCommand);
  bot.command('tasks', tasksCommand);
  bot.command('schedule', scheduleCommand);
  bot.command('research', researchCommand);

  // Commands — vault-dependent
  bot.command('projects', vaultGuard(projectsCommand));
  bot.command('note', vaultGuard(noteCommand));
  bot.command('log', vaultGuard(logCommand));
  bot.command('goals', vaultGuard(goalsCommand));
  bot.command('weekly', vaultGuard(weeklyCommand));
  bot.command('project', vaultGuard(projectCommand));
  bot.command('expense', vaultGuard(expenseCommand));

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
