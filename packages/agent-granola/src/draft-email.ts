/**
 * Draft Recap Email from Meeting
 *
 * Uses Claude to generate a concise recap email and saves it as a Gmail draft.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getGoogleClients, loadConfig, resolveAccount } from '@lifeos/shared';
import type { MeetingData } from '@lifeos/shared';

const anthropic = new Anthropic();

/**
 * Generate and save a recap email draft.
 * Returns true if draft was created, false otherwise.
 */
export async function draftRecapEmail(
  meeting: MeetingData,
  project?: string | null
): Promise<boolean> {
  // Skip if no attendees (solo meeting / no one to email)
  if (meeting.attendees.length === 0) return false;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[draft-email] No ANTHROPIC_API_KEY — skipping');
    return false;
  }

  try {
    // Generate email content using Claude
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: `You write concise, professional meeting recap emails. Write the email body only (no subject line, no headers). Be direct, use bullet points for key decisions and action items. Keep it under 300 words. Do not include greeting or sign-off — those will be added separately.`,
      messages: [{
        role: 'user',
        content: `Write a recap email for this meeting:

Title: ${meeting.title}
Date: ${meeting.date}
Attendees: ${meeting.attendees.join(', ')}

Summary:
${meeting.summary.slice(0, 3000)}

Transcript (key parts):
${meeting.transcript.slice(0, 5000)}`,
      }],
    });

    const emailBody = response.content[0].type === 'text' ? response.content[0].text : '';
    if (!emailBody) return false;

    // Determine which account to draft from
    const config = loadConfig();
    const draftAlias = project
      ? resolveAccount(config, project, 'draft').alias
      : config.accounts.find((a) => a.isDefaultDraft)?.alias ?? config.defaultAccount;

    const accountEmail = config.accounts.find((a) => a.alias === draftAlias)?.email ?? '';
    const { gmail } = getGoogleClients(draftAlias);

    // Build the email
    const subject = `Recap: ${meeting.title} (${meeting.date.split('T')[0]})`;
    const fullBody = `Hi all,\n\nHere's a quick recap of our meeting:\n\n${emailBody}\n\nBest regards`;

    const headers = [
      `From: ${accountEmail}`,
      `To: ${meeting.attendees.join(', ')}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      fullBody,
    ].join('\r\n');

    const encodedMessage = Buffer.from(headers)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encodedMessage },
      },
    });

    console.log(`[draft-email] Recap draft created in ${draftAlias} for "${meeting.title}"`);
    return true;
  } catch (error) {
    console.error('[draft-email] Failed to draft recap email:', error);
    return false;
  }
}
