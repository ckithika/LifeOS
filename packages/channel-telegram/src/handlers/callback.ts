/**
 * Inline keyboard callback router
 *
 * Prefix routing:
 *   nav:   — menu transitions (edit-in-place)
 *   m:     — direct feature actions (new messages)
 *   in:    — start conversational input (set session + prompt)
 *   ref:   — refresh data views
 *   goal:  — goal selection for update
 *   done:  — complete task
 *   proj:  — project drill-down
 *   expok:/expcancel: — receipt expense confirmation
 *   menu:  — legacy fallback → m:
 *   log:   — legacy fallback → in:log_*
 */

import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { getGoogleClients } from '@lifeos/shared';
import { briefingCommand } from '../commands/briefing.js';
import { tasksCommand } from '../commands/tasks.js';
import { scheduleCommand } from '../commands/schedule.js';
import { projectsCommand } from '../commands/projects.js';
import { goalsCommand } from '../commands/goals.js';
import { projectCommand } from '../commands/project.js';
import { weeklyCommand } from '../commands/weekly.js';
import { handleGoalSelect } from '../commands/goals.js';
import { handleExpenseCallback } from './photo.js';
import { setSession, clearSession } from '../state.js';
import { safeEdit } from '../navigation.js';
import {
  buildMainMenu, buildTrackMenu, buildLogCategoryMenu, buildVaultMenu,
  MAIN_MENU_TEXT, TRACK_MENU_TEXT, LOG_CATEGORY_TEXT, VAULT_MENU_TEXT,
  sendMainMenu,
} from '../menus.js';

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  // ─── nav: menu transitions (edit-in-place) ──────────
  if (data.startsWith('nav:')) {
    return handleNav(ctx, data.slice(4));
  }

  // ─── m: feature actions (new message) ───────────────
  if (data.startsWith('m:')) {
    return handleAction(ctx, data.slice(2));
  }

  // ─── in: conversational input ───────────────────────
  if (data.startsWith('in:')) {
    return handleInput(ctx, data.slice(3));
  }

  // ─── ref: refresh data views ────────────────────────
  if (data.startsWith('ref:')) {
    return handleAction(ctx, data.slice(4));
  }

  // ─── goal: goal selection ───────────────────────────
  if (data.startsWith('goal:')) {
    return handleGoalSelect(ctx, data.slice(5));
  }

  // ─── done: task completion ──────────────────────────
  if (data.startsWith('done:')) {
    return handleDoneCallback(ctx, data);
  }

  // ─── proj: project drill-down ───────────────────────
  if (data.startsWith('proj:')) {
    return handleProjectCallback(ctx, data.slice(5));
  }

  // ─── expense confirmation ───────────────────────────
  if (data.startsWith('expok:') || data.startsWith('expcancel:')) {
    return handleExpenseCallback(ctx, data);
  }

  // ─── Legacy fallbacks ──────────────────────────────
  if (data.startsWith('menu:')) {
    return handleAction(ctx, data.slice(5));
  }
  if (data.startsWith('log:')) {
    return handleInput(ctx, `log_${data.slice(4)}`);
  }
}

// ─── Navigation (edit-in-place) ─────────────────────────

async function handleNav(ctx: Context, target: string): Promise<void> {
  const userId = ctx.from?.id;

  switch (target) {
    case 'main':
      if (userId) clearSession(userId);
      return safeEdit(ctx, MAIN_MENU_TEXT, {
        parse_mode: 'HTML',
        reply_markup: buildMainMenu(),
      });
    case 'track':
      if (userId) clearSession(userId);
      return safeEdit(ctx, TRACK_MENU_TEXT, {
        parse_mode: 'HTML',
        reply_markup: buildTrackMenu(),
      });
    case 'vault':
      if (userId) clearSession(userId);
      return safeEdit(ctx, VAULT_MENU_TEXT, {
        parse_mode: 'HTML',
        reply_markup: buildVaultMenu(),
      });
    case 'log':
      if (userId) clearSession(userId);
      return safeEdit(ctx, LOG_CATEGORY_TEXT, {
        parse_mode: 'HTML',
        reply_markup: buildLogCategoryMenu(),
      });
    case 'cancel':
      if (userId) clearSession(userId);
      await sendMainMenu(ctx);
      return;
    default:
      await ctx.reply(`Unknown navigation: ${target}`);
  }
}

// ─── Feature actions (new message) ──────────────────────

async function handleAction(ctx: Context, action: string): Promise<void> {
  switch (action) {
    case 'briefing':
      return briefingCommand(ctx);
    case 'tasks':
      return tasksCommand(ctx);
    case 'schedule':
      return scheduleCommand(ctx);
    case 'projects':
      return projectsCommand(ctx);
    case 'goals':
      return goalsCommand(ctx);
    case 'weekly':
      return weeklyCommand(ctx);
    default:
      await ctx.reply(`Unknown action: ${action}`);
  }
}

// ─── Conversational input starters ──────────────────────

async function handleInput(ctx: Context, input: string): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const cancelKb = new InlineKeyboard().text('Cancel', 'nav:cancel');

  if (input === 'note') {
    setSession(userId, 'note');
    await ctx.reply('What would you like to note?', { reply_markup: cancelKb });
    return;
  }

  if (input === 'research') {
    setSession(userId, 'research');
    await ctx.reply('What topic should I research?', { reply_markup: cancelKb });
    return;
  }

  if (input === 'exp') {
    setSession(userId, 'expense_amount');
    await ctx.reply('How much?', { reply_markup: cancelKb });
    return;
  }

  // Log categories: in:log_mood, in:log_energy, etc.
  if (input.startsWith('log_')) {
    const category = input.slice(4);
    setSession(userId, 'log_value', { category });
    const example = category === 'mood' ? '8' : category === 'workout' ? 'gym 45min' : category === 'sleep' ? '7.5' : '2L';
    await ctx.reply(
      `Enter your <b>${category}</b> value:\n\n<i>e.g. ${example}</i>`,
      { parse_mode: 'HTML', reply_markup: cancelKb },
    );
    return;
  }

  await ctx.reply(`Unknown input flow: ${input}`);
}

// ─── Task completion ────────────────────────────────────

async function handleDoneCallback(ctx: Context, data: string): Promise<void> {
  const parts = data.split(':');
  if (parts.length < 3) {
    await ctx.reply('Invalid task reference.');
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
    await ctx.reply('Task marked complete!');
  } catch (error: any) {
    console.error('[callback] Done error:', error.message);
    await ctx.reply(`Could not complete task: ${error.message}`);
  }
}

// ─── Project drill-down ─────────────────────────────────

async function handleProjectCallback(ctx: Context, slug: string): Promise<void> {
  const fakeCtx = {
    ...ctx,
    message: { ...ctx.message, text: `/project ${slug}` },
  } as Context;
  return projectCommand(fakeCtx);
}
