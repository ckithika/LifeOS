/**
 * Provider-agnostic conversation memory.
 *
 * Stores messages as simple {role, content} pairs that can be converted
 * to Anthropic or Gemini format via helper functions.
 */

import type Anthropic from '@anthropic-ai/sdk';

// ─── Types ────────────────────────────────────────────────────

export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ConversationEntry {
  messages: MemoryMessage[];
  lastActive: number;
}

// ─── State ────────────────────────────────────────────────────

const conversations = new Map<string, ConversationEntry>();
const MAX_HISTORY = 20;
const MEMORY_TTL = 30 * 60_000; // 30 minutes

// ─── Core API ─────────────────────────────────────────────────

export function getConversation(chatId: string): MemoryMessage[] {
  const entry = conversations.get(chatId);
  if (!entry) return [];
  if (Date.now() - entry.lastActive > MEMORY_TTL) {
    conversations.delete(chatId);
    return [];
  }
  return entry.messages;
}

export function saveConversation(chatId: string, messages: MemoryMessage[]) {
  const trimmed = messages.slice(-MAX_HISTORY);
  conversations.set(chatId, { messages: trimmed, lastActive: Date.now() });
}

// ─── Format Converters ───────────────────────────────────────

/** Convert to Anthropic message format */
export function toAnthropicHistory(messages: MemoryMessage[]): Anthropic.Messages.MessageParam[] {
  return messages.map(m => ({
    role: m.role,
    content: m.content,
  }));
}

/** Convert to Gemini Content[] format */
export function toGeminiHistory(messages: MemoryMessage[]): Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}> {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: m.content }],
  }));
}
