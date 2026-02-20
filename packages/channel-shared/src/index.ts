/**
 * @lifeos/channel-shared — Shared AI/tools infrastructure for messaging channels
 *
 * Provides tool definitions, AI orchestration (Gemini + Claude),
 * conversation memory, and agent client for all LifeOS channels.
 */

// Types
export type { AgentResponse, ChatOptions } from './types.js';
export type { MemoryMessage } from './memory.js';
export type { ToolParam } from './tools.js';

// AI orchestrator
export { chat } from './ai.js';

// Tools
export {
  TOOL_DEFS,
  TOOL_GROUPS,
  executeTool,
  routeTools,
  getActiveToolDefs,
  toAnthropicTools,
  toGeminiTools,
} from './tools.js';

// Memory
export {
  getConversation,
  saveConversation,
  loadFromVault,
  toAnthropicHistory,
  toGeminiHistory,
} from './memory.js';

// Providers
export { getSystemPrompt, chatWithClaude } from './claude.js';
export { chatWithGemini } from './gemini.js';

// Agent client
export {
  callAgent,
  triggerBriefing,
  triggerWeeklyReview,
  triggerResearch,
} from './agent-client.js';
