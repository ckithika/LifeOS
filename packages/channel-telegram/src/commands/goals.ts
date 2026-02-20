/**
 * /goals command — view and update quarterly goals
 *
 * /goals — show current goals with progress bars + Update buttons
 * /goals update "Goal title" <value> — update a key result's current value
 * Button flow: goal:{index} → prompt for value → update
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { readFile, writeFile } from '@lifeos/shared';
import { parseGoals, formatGoals, formatGoalsSummary } from '@lifeos/shared';
import { truncateForTelegram } from '../formatting.js';
import { setSession } from '../state.js';

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

      await updateGoalValue(ctx, goal, newValue, file.content);
      return;
    }

    // Default: show all goals with Update buttons
    const summary = formatGoalsSummary(goals);
    const keyboard = new InlineKeyboard();

    const updatable = goals.filter(g => g.keyResult && !g.completed);
    for (let i = 0; i < updatable.length; i++) {
      keyboard.text(`Update: ${updatable[i].title.slice(0, 18)}`, `goal:${i}`);
      if (i % 2 === 1) keyboard.row();
    }
    if (updatable.length % 2 === 1) keyboard.row();
    keyboard.text('← Menu', 'nav:main');

    const header = '<b>Quarterly Goals</b>\n\n';
    await ctx.reply(truncateForTelegram(header + summary), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (error: any) {
    console.error('[goals] Error:', error.message);
    await ctx.reply(`Could not load goals: ${error.message}`);
  }
}

/** Callback handler for goal:{index} — sets session and prompts for value */
export async function handleGoalSelect(ctx: Context, indexStr: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const index = parseInt(indexStr, 10);

  try {
    const file = await readFile(GOALS_PATH);
    if (!file) {
      await ctx.reply('Goals file not found.');
      return;
    }

    const goals = parseGoals(file.content);
    const updatable = goals.filter(g => g.keyResult && !g.completed);
    const goal = updatable[index];

    if (!goal) {
      await ctx.reply('Goal not found.');
      return;
    }

    setSession(userId, 'goal_update', {
      title: goal.title,
      goalIndex: index,
    });

    const kr = goal.keyResult!;
    await ctx.reply(
      `New value for <b>${goal.title}</b>?\n\nCurrent: ${kr.current}/${kr.target} ${kr.unit}`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard().text('Cancel', 'nav:cancel'),
      },
    );
  } catch (error: any) {
    await ctx.reply(`Could not load goal: ${error.message}`);
  }
}

/** Button-flow handler — called from session interception */
export async function handleGoalValueInput(ctx: Context, text: string, data: Record<string, any>): Promise<void> {
  const newValue = parseInt(text.trim(), 10);
  if (isNaN(newValue)) {
    await ctx.reply('Please enter a number.');
    return;
  }

  try {
    const file = await readFile(GOALS_PATH);
    if (!file) {
      await ctx.reply('Goals file not found.');
      return;
    }

    const goals = parseGoals(file.content);
    const goal = goals.find(g => g.title === data.title);

    if (!goal || !goal.keyResult) {
      await ctx.reply('Goal not found or has no key result.');
      return;
    }

    await updateGoalValue(ctx, goal, newValue, file.content, true);
  } catch (error: any) {
    await ctx.reply(`Could not update goal: ${error.message}`);
  }
}

async function updateGoalValue(
  ctx: Context,
  goal: any,
  newValue: number,
  fileContent: string,
  showNav = false,
): Promise<void> {
  goal.keyResult.current = newValue;
  if (goal.keyResult.current >= goal.keyResult.target) {
    goal.completed = true;
  }

  const goals = parseGoals(fileContent);
  const target = goals.find(g => g.title === goal.title);
  if (target?.keyResult) {
    target.keyResult.current = newValue;
    if (target.keyResult.current >= target.keyResult.target) {
      target.completed = true;
    }
  }

  const frontmatterMatch = fileContent.match(/^(---\n[\s\S]*?\n---\n)/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const titleMatch = fileContent.match(/^(# .+\n)/m);
  const title = titleMatch ? titleMatch[1] : '';

  const newContent = frontmatter + '\n' + title + '\n' + formatGoals(goals);
  await writeFile(GOALS_PATH, newContent, `lifeos: update goal "${goal.title}"`);

  const opts: any = { parse_mode: 'HTML' };
  if (showNav) {
    opts.reply_markup = new InlineKeyboard()
      .text('← Goals', 'm:goals')
      .text('← Menu', 'nav:main');
  }
  await ctx.reply(
    `Updated <b>${goal.title}</b>: ${newValue}/${goal.keyResult.target} ${goal.keyResult.unit}`,
    opts,
  );
}
