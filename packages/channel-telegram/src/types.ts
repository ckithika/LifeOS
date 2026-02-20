/**
 * Telegram-specific type definitions
 */

export interface TelegramConfig {
  botToken: string;
  webhookSecret: string;
  allowedUsers: number[];
  chatId: string;
}

export interface ReminderCheck {
  events: UpcomingEvent[];
  notified: number;
}

export interface UpcomingEvent {
  id: string;
  summary: string;
  start: string;
  minutesUntil: number;
  account: string;
  location?: string;
  meetUrl?: string;
  htmlLink?: string;
  attendees: Array<{ name: string; email: string }>;
}
