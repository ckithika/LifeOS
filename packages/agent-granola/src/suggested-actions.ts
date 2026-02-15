/**
 * Generate Suggested Actions from Meeting Context
 *
 * Analyzes meeting content and proposes:
 * - Deliverables to create (presentations, proposals, docs)
 * - Follow-up communications
 * - Research items
 * - Calendar actions
 *
 * Low-risk actions auto-execute; high-risk queue for approval.
 */

import Anthropic from '@anthropic-ai/sdk';
import { isAutoExecute } from '@lifeos/shared';
import type { MeetingData, SuggestedAction, ActionType } from '@lifeos/shared';
import type { SchedulingRequest } from './detect-scheduling.js';
import { detectSchedulingLanguage } from './detect-scheduling.js';

const anthropic = new Anthropic();

interface ProcessingResults {
  transcriptSaved: boolean;
  summarySaved: boolean;
  projectUpdated: string | null;
  tasksCreated: number;
  draftCreated: boolean;
  schedulingDetected: boolean;
}

/**
 * Generate suggested actions based on meeting content and processing results.
 */
export async function generateSuggestedActions(
  meeting: MeetingData,
  project: string | undefined | null,
  results: ProcessingResults
): Promise<SuggestedAction[]> {
  const suggestions: SuggestedAction[] = [];

  // 1. Scheduling-based suggestions
  const schedulingRequests = detectSchedulingLanguage(meeting.transcript);
  for (const req of schedulingRequests) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'create_calendar_invite',
      description: `Schedule follow-up: "${req.phrase}"${req.suggestedTiming ? ` (${req.suggestedTiming})` : ''}`,
      risk: 'high',
      autoExecute: false,
      status: 'pending',
      metadata: {
        meetingTitle: meeting.title,
        schedulingPhrase: req.phrase,
        suggestedTiming: req.suggestedTiming,
        attendees: meeting.attendees,
      },
      createdAt: new Date().toISOString(),
      sourceType: 'meeting',
      sourceId: meeting.id,
    });
  }

  // 2. AI-generated suggestions
  const aiSuggestions = await getAISuggestions(meeting, project);
  suggestions.push(...aiSuggestions);

  // 3. Standard follow-up suggestions
  if (meeting.attendees.length > 0 && !results.draftCreated) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'create_draft_email',
      description: `Draft recap email to ${meeting.attendees.length} attendee(s) from "${meeting.title}"`,
      risk: 'high',
      autoExecute: false,
      status: 'pending',
      metadata: {
        meetingTitle: meeting.title,
        attendees: meeting.attendees,
      },
      createdAt: new Date().toISOString(),
      sourceType: 'meeting',
      sourceId: meeting.id,
    });
  }

  // 4. Project note update if not already done
  if (project && !results.projectUpdated) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'update_project_note',
      description: `Link meeting "${meeting.title}" to project "${project}"`,
      risk: 'low',
      autoExecute: true,
      status: 'pending',
      metadata: { project, meetingTitle: meeting.title },
      createdAt: new Date().toISOString(),
      sourceType: 'meeting',
      sourceId: meeting.id,
    });
  }

  return suggestions;
}

/**
 * Use Claude to suggest deliverables and follow-ups.
 */
async function getAISuggestions(
  meeting: MeetingData,
  project: string | undefined | null
): Promise<SuggestedAction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You analyze meetings and suggest follow-up actions. Return ONLY a JSON array of suggested actions. Each has:
- type: one of "create_task", "create_draft_email", "create_calendar_invite", "update_project_note"
- description: concise action description
- priority: "high", "medium", or "low"

Focus on:
- Deliverables mentioned (presentations, proposals, documents)
- Commitments made ("I'll send...", "We need to...")
- Research needed
- People to loop in

Return [] if no clear follow-ups. Max 5 suggestions.`,
      messages: [{
        role: 'user',
        content: `Meeting: "${meeting.title}" (${meeting.date})
Attendees: ${meeting.attendees.join(', ')}
${project ? `Project: ${project}` : ''}

Summary:
${meeting.summary.slice(0, 3000)}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const rawSuggestions = JSON.parse(cleaned);

    return rawSuggestions.map((s: any) => ({
      id: crypto.randomUUID(),
      type: s.type as ActionType,
      description: s.description,
      risk: isAutoExecute(s.type) ? 'low' as const : 'high' as const,
      autoExecute: isAutoExecute(s.type),
      status: 'pending' as const,
      metadata: { aiGenerated: true, priority: s.priority },
      createdAt: new Date().toISOString(),
      sourceType: 'meeting' as const,
      sourceId: meeting.id,
    }));
  } catch (error) {
    console.error('[suggested-actions] AI suggestion failed:', error);
    return [];
  }
}
