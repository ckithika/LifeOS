/**
 * /tasks command — list active tasks with Done buttons
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getAllAccountClients } from '@lifeos/shared';
import type { TaskItem } from '@lifeos/shared';

export async function tasksCommand(ctx: Context): Promise<void> {
  await ctx.reply('Fetching tasks...');

  const tasks: (TaskItem & { account: string })[] = [];

  let allClients: Map<string, any>;
  try {
    allClients = getAllAccountClients();
  } catch (error: any) {
    await ctx.reply(`Could not load accounts: ${error.message}`);
    return;
  }

  for (const [alias, clients] of allClients) {
    try {
      const response = await clients.tasks.tasks.list({
        tasklist: '@default',
        showCompleted: false,
        maxResults: 20,
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
      console.warn(`[tasks] Error for ${alias}:`, error.message);
    }
  }

  if (tasks.length === 0) {
    await ctx.reply('No active tasks!', {
      reply_markup: new InlineKeyboard()
        .text('🔄 Refresh', 'ref:tasks')
        .text('← Menu', 'nav:main'),
    });
    return;
  }

  tasks.sort((a, b) => {
    if (!a.due && !b.due) return 0;
    if (!a.due) return 1;
    if (!b.due) return -1;
    return new Date(a.due).getTime() - new Date(b.due).getTime();
  });

  const display = tasks.slice(0, 10);

  const lines = display.map((t, i) => {
    const due = t.due ? ` (${new Date(t.due).toLocaleDateString('en-KE')})` : '';
    return `${i + 1}. ${t.title}${due} <i>[${t.account}]</i>`;
  });

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < display.length; i += 2) {
    const t1 = display[i];
    keyboard.text(`Done ${i + 1}`, `done:${t1.id}:${t1.account}`);
    if (i + 1 < display.length) {
      const t2 = display[i + 1];
      keyboard.text(`Done ${i + 2}`, `done:${t2.id}:${t2.account}`);
    }
    keyboard.row();
  }
  keyboard.text('🔄 Refresh', 'ref:tasks').text('← Menu', 'nav:main');

  const header = `<b>Active Tasks (${tasks.length})</b>\n\n`;
  await ctx.reply(header + lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}
