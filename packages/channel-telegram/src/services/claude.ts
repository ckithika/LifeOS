/**
 * Claude (Anthropic) AI provider for LifeOS Telegram bot.
 *
 * Handles SDK init and the agentic tool-use loop.
 * Tools, executor, and memory are imported from shared modules.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getAccounts } from '@lifeos/shared';
import { type ToolParam, toAnthropicTools, executeTool } from './tools.js';
import {
  getConversation,
  saveConversation,
  toAnthropicHistory,
  type MemoryMessage,
} from './memory.js';

// ─── SDK ──────────────────────────────────────────────────────

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

function getModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-opus-4-6';
}

// ─── System Prompt ────────────────────────────────────────────

export function getSystemPrompt(): string {
  // Build dynamic account context from config
  const accounts = getAccounts();
  const accountLines = accounts.map(a => {
    const roles: string[] = [];
    if (a.isDefaultDraft) roles.push('default for email drafts');
    if (a.isDefaultTasks) roles.push('default for tasks');
    if (a.projects.includes('*')) roles.push('all projects');
    else if (a.projects.length > 0) roles.push(`projects: ${a.projects.join(', ')}`);
    return `- "${a.alias}" (${a.email}, ${a.type})${roles.length ? ' — ' + roles.join(', ') : ''}`;
  }).join('\n');

  const defaultDraft = accounts.find(a => a.isDefaultDraft)?.alias || accounts[0]?.alias || 'personal';
  const defaultTasks = accounts.find(a => a.isDefaultTasks)?.alias || accounts[0]?.alias || 'personal';

  return `You are LifeOS, a personal AI assistant accessed via Telegram.
You help manage calendar, tasks, projects, emails, notes, files, and contacts.

You have FULL tool access to read AND write data. USE THEM proactively:
- When asked about schedule/tasks/projects/contacts → fetch the real data
- When asked to create events, tasks, drafts, notes, or projects → use the write tools directly
- When asked about emails → search and read them
- When asked about files → search Drive or the vault
- Do NOT tell the user to do things manually — just do it for them
- Do NOT suggest slash commands — handle everything conversationally
- Use contacts_lookup to find email addresses before creating invites

Google accounts available:
${accountLines}

Use account "${defaultDraft}" for email drafts by default.
Use account "${defaultTasks}" for tasks by default.
For calendar events, use "personal" by default unless the user specifies otherwise.
When the user mentions an account by name (e.g., "vivo"), use that account's alias in tool calls.
All accounts have full access to Gmail, Calendar, Tasks, Drive, and Contacts.

Timezone is EAT (UTC+3). Use +03:00 offsets for all times.

Keep responses concise and mobile-friendly:
- Use short paragraphs and bullet points
- Bold important items with **bold**
- Keep under 2000 characters when possible
- Confirm actions after completing them (e.g., "Done! Added 'Study: AI Agents' at 11am today.")

Current date: ${new Date().toISOString().split('T')[0]}
Timezone: EAT (UTC+3)`;
}

// ─── Agentic Loop ─────────────────────────────────────────────

export async function chatWithClaude(
  userMessage: string,
  chatId: string | undefined,
  tools: ToolParam[],
): Promise<string> {
  const anthropic = getClient();
  const anthropicTools = toAnthropicTools(tools);
  const cid = chatId || 'default';

  // Build messages with conversation history
  const history = getConversation(cid);
  const anthropicHistory = toAnthropicHistory(history);
  const messages: Anthropic.Messages.MessageParam[] = [
    ...anthropicHistory,
    { role: 'user', content: userMessage },
  ];

  // Agentic loop: keep going while Claude wants to use tools
  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 2048,
      system: getSystemPrompt(),
      tools: anthropicTools,
      messages,
    });

    // If no tool use, return the text response
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(block => block.type === 'text');
      const reply = textBlock?.text ?? 'No response generated.';

      messages.push({ role: 'assistant', content: response.content });
      saveConversation(cid, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]);

      return reply;
    }

    // Process tool calls
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      const textBlock = response.content.find(block => block.type === 'text');
      const reply = textBlock?.text ?? 'No response generated.';
      messages.push({ role: 'assistant', content: response.content });
      saveConversation(cid, [
        ...history,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: reply },
      ]);
      return reply;
    }

    // Add assistant message with tool use
    messages.push({ role: 'assistant', content: response.content });

    // Execute tools and add results
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Save what we have even on limit
  saveConversation(cid, [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: 'I ran into a limit processing your request.' },
  ]);
  return 'I ran into a limit processing your request. Try a simpler question.';
}
