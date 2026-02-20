/**
 * /projects command — list active projects
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { listProjects } from '@lifeos/shared';
import { truncateForTelegram } from '../formatting.js';

export async function projectsCommand(ctx: Context): Promise<void> {
  try {
    const projects = await listProjects();
    const active = projects.filter(p => p.status === 'active');

    if (active.length === 0) {
      await ctx.reply('No active projects found.', {
        reply_markup: new InlineKeyboard().text('← Vault', 'nav:vault').text('← Menu', 'nav:main'),
      });
      return;
    }

    const lines = active.map(p => {
      const category = p.category ? ` <i>[${p.category}]</i>` : '';
      return `<b>${p.title}</b>${category}`;
    });

    const keyboard = new InlineKeyboard();
    for (let i = 0; i < active.length && i < 10; i++) {
      keyboard.text(active[i].title.slice(0, 20), `proj:${active[i].slug}`);
      if (i % 2 === 1) keyboard.row();
    }
    if (active.length % 2 === 1) keyboard.row();
    keyboard.text('← Vault', 'nav:vault').text('← Menu', 'nav:main');

    const header = `<b>Active Projects (${active.length})</b>\n\n`;
    await ctx.reply(truncateForTelegram(header + lines.join('\n')), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error: any) {
    await ctx.reply(`Could not load projects: ${error.message}`);
  }
}
