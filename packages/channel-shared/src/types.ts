/**
 * Shared types for LifeOS messaging channels
 */

export interface AgentResponse {
  text: string;
  error?: string;
}

export interface ChatOptions {
  chatId?: string;
  channelName: string;
}
