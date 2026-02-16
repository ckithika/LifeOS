/**
 * Telegram-specific type definitions
 */

export interface TelegramConfig {
  botToken: string;
  webhookSecret: string;
  allowedUsers: number[];
  chatId: string;
}

export interface AgentResponse {
  text: string;
  error?: string;
}

export interface ReminderCheck {
  events: UpcomingEvent[];
  notified: number;
}

export interface UpcomingEvent {
  summary: string;
  start: string;
  minutesUntil: number;
  account: string;
}
