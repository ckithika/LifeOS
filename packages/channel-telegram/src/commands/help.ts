/**
 * /help, /start, /menu command — comprehensive help + main menu
 */

import type { Context } from 'grammy';
import { sendMainMenu } from '../menus.js';

const HELP_TEXT = `<b>LifeOS</b> — Your personal AI assistant

<b>What you can do:</b>

<b>Buttons</b> — Tap <b>Menu</b> below for quick access to everything.

<b>AI Chat</b> — Just type naturally:
  <i>"What's on my plate today?"</i>
  <i>"Search my emails for the invoice from Acme"</i>
  <i>"Draft a follow-up to Kevin"</i>

<b>Voice</b> — Send a voice message to transcribe &amp; save it.

<b>Receipts</b> — Send a photo of a receipt to auto-log the expense.

<b>Slash commands</b> (power-user shortcuts):
  /briefing — Today's calendar + tasks + emails
  /tasks — Active tasks with Done buttons
  /schedule — Today's events with Join links
  /research <i>topic</i> — Deep research report
  /note <i>text</i> — Quick capture to daily note
  /log <i>category value</i> — Track mood, energy, sleep, etc.
  /goals — View &amp; update quarterly goals
  /expense <i>amount desc</i> — Log an expense
  /projects — Active project list
  /weekly — Weekly review report
  /status — System health &amp; sync status`;

export async function helpCommand(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
  await sendMainMenu(ctx);
}
