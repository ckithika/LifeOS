/**
 * /goals command — view and update quarterly goals
 *
 * /goals — show current goals with progress bars
 * /goals update "Goal title" <value> — update a key result's current value
 */

import type { Context } from 'grammy';
import { readFile, writeFile } from '@lifeos/shared';
import { parseGoals, formatGoals, formatGoalsSummary } from '@lifeos/shared';
import { truncateForTelegram } from '../formatting.js';

const GOALS_PATH = 'Areas/Personal/goals.md';

export async function goalsCommand(ctx: Context): Promise<void> {
  const args = ctx.message?.text?.replace(/^\/goals\s*/, '').trim();

  try {
    const file = await readFile(GOALS_PATH);
    if (!file) {
      await ctx.reply(
        `No goals file found at <code>${GOALS_PATH}</code>.\n\nCreate one with quarterly goals in this format:\n<pre>### Health\n- [ ] Run 3x per week\n  - Target: 36 | Current: 12 | Unit: runs</pre>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    const goals = parseGoals(file.content);

    // Update command: /goals update "Goal title" <value>
    if (args && args.startsWith('update ')) {
      const updateArgs = args.slice(7).trim();
      // Match: "quoted title" value OR unquoted-title value
      const match = updateArgs.match(/^"([^"]+)"\s+(\d+)/) ||
                    updateArgs.match(/^(.+?)\s+(\d+)$/);

      if (!match) {
        await ctx.reply(
          'Usage: <code>/goals update "Goal title" 15</code>',
          { parse_mode: 'HTML' },
        );
        return;
      }

      const targetTitle = match[1].trim().toLowerCase();
      const newValue = parseInt(match[2], 10);

      const goal = goals.find(g => g.title.toLowerCase().includes(targetTitle));
      if (!goal) {
        await ctx.reply(`Goal not found: "${match[1]}"`);
        return;
      }

      if (!goal.keyResult) {
        await ctx.reply(`Goal "${goal.title}" has no key result to update.`);
        return;
      }

      goal.keyResult.current = newValue;
      if (goal.keyResult.current >= goal.keyResult.target) {
        goal.completed = true;
      }

      // Rebuild the file preserving frontmatter
      const frontmatterMatch = file.content.match(/^(---\n[\s\S]*?\n---\n)/);
      const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
      const titleMatch = file.content.match(/^(# .+\n)/m);
      const title = titleMatch ? titleMatch[1] : '';

      const newContent = frontmatter + '\n' + title + '\n' + formatGoals(goals);
      await writeFile(GOALS_PATH, newContent, `lifeos: update goal "${goal.title}"`);

      await ctx.reply(
        `Updated <b>${goal.title}</b>: ${newValue}/${goal.keyResult.target} ${goal.keyResult.unit}`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    // Default: show all goals
    const summary = formatGoalsSummary(goals);
    const header = '<b>Quarterly Goals</b>\n\n';
    await ctx.reply(truncateForTelegram(header + summary), { parse_mode: 'HTML' });
  } catch (error: any) {
    console.error('[goals] Error:', error.message);
    await ctx.reply(`Could not load goals: ${error.message}`);
  }
}
