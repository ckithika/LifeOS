/**
 * Provider-agnostic conversation memory with vault persistence.
 *
 * In-memory Map for fast reads. On cold start, loads from vault.
 * Writes are debounced to avoid excessive GitHub API calls.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile, isVaultConfigured } from '@lifeos/shared';

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
const MEMORY_TTL = 2 * 60 * 60_000; // 2 hours
const VAULT_PATH = 'Files/.system/conversations.json';

/** Track whether we've loaded from vault this container lifetime */
let vaultLoaded = false;

/** Debounce timers for vault writes */
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  // Debounced vault persistence (3s after last save)
  schedulePersist(chatId);
}

/**
 * Load conversation history from vault on cold start.
 * Call once before first getConversation.
 */
export async function loadFromVault(): Promise<void> {
  if (vaultLoaded || !isVaultConfigured()) return;
  vaultLoaded = true;

  try {
    const file = await readFile(VAULT_PATH);
    if (!file) return;

    const data = JSON.parse(file.content) as Record<string, ConversationEntry>;
    const now = Date.now();

    for (const [chatId, entry] of Object.entries(data)) {
      // Skip expired entries
      if (now - entry.lastActive > MEMORY_TTL) continue;
      conversations.set(chatId, entry);
    }
    console.log(`[memory] Loaded ${conversations.size} conversations from vault`);
  } catch (error: any) {
    console.warn('[memory] Could not load from vault:', error.message);
  }
}

// ─── Vault Persistence ──────────────────────────────────────

function schedulePersist(chatId: string): void {
  if (!isVaultConfigured()) return;

  const existing = writeTimers.get(chatId);
  if (existing) clearTimeout(existing);

  writeTimers.set(chatId, setTimeout(() => {
    writeTimers.delete(chatId);
    persistToVault().catch(err =>
      console.warn('[memory] Vault persist error:', err.message)
    );
  }, 3000));
}

async function persistToVault(): Promise<void> {
  const data: Record<string, ConversationEntry> = {};
  const now = Date.now();

  for (const [chatId, entry] of conversations) {
    if (now - entry.lastActive < MEMORY_TTL) {
      data[chatId] = entry;
    }
  }

  await writeFile(VAULT_PATH, JSON.stringify(data, null, 2), 'lifeos: save conversation memory');
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
