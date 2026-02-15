/**
 * Extract Action Items from Meeting Transcript
 *
 * Uses Claude API to identify action items, deadlines, and assignees
 * from meeting transcripts. Creates Google Tasks for each.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getGoogleClients, loadConfig } from '@lifeos/shared';
import type { MeetingData } from '@lifeos/shared';

interface ActionItem {
  title: string;
  assignee?: string;
  deadline?: string;
  notes?: string;
}

const anthropic = new Anthropic();

/**
 * Extract action items from a meeting and create Google Tasks.
 */
export async function extractActions(meeting: MeetingData): Promise<ActionItem[]> {
  const items = await identifyActionItems(meeting);

  if (items.length === 0) return [];

  // Create Google Tasks for each action item
  const config = loadConfig();
  const defaultTaskAccount = config.accounts.find((a) => a.isDefaultTasks)?.alias ?? config.defaultAccount;

  try {
    const { tasks } = getGoogleClients(defaultTaskAccount);

    for (const item of items) {
      await tasks.tasks.insert({
        tasklist: '@default',
        requestBody: {
          title: item.title,
          notes: [
            item.notes ?? '',
            `From meeting: ${meeting.title} (${meeting.date})`,
            item.assignee ? `Assigned to: ${item.assignee}` : '',
          ].filter(Boolean).join('\n'),
          due: item.deadline ? new Date(item.deadline).toISOString() : undefined,
        },
      });
    }

    console.log(`[extract-actions] Created ${items.length} tasks in ${defaultTaskAccount}`);
  } catch (error) {
    console.error('[extract-actions] Failed to create some tasks:', error);
  }

  return items;
}

/**
 * Use Claude to identify action items from transcript.
 */
async function identifyActionItems(meeting: MeetingData): Promise<ActionItem[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[extract-actions] No ANTHROPIC_API_KEY — skipping AI extraction');
    return [];
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You extract action items from meeting transcripts. Return ONLY a JSON array of action items. Each item has: title (string, concise action), assignee (string or null), deadline (ISO date string or null), notes (string or null, brief context). If no action items, return [].`,
      messages: [{
        role: 'user',
        content: `Meeting: "${meeting.title}" (${meeting.date})
Attendees: ${meeting.attendees.join(', ')}

Transcript:
${meeting.transcript.slice(0, 8000)}

${meeting.summary ? `Summary:\n${meeting.summary.slice(0, 2000)}` : ''}

Extract all action items. Return JSON array only.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const items: ActionItem[] = JSON.parse(cleaned);

    return items.filter((item) => item.title && item.title.length > 0);
  } catch (error) {
    console.error('[extract-actions] AI extraction failed:', error);
    return [];
  }
}
