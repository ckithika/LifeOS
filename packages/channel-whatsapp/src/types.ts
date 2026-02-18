/**
 * WhatsApp-specific type definitions
 */

export interface WhatsAppConfig {
  sessionBucket?: string;
  chatNumber: string;
  allowedNumbers: string[];
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
