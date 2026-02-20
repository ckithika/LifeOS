/**
 * User session state — in-memory Map with 15-minute TTL
 *
 * Tracks conversational input flows (note, research, expense, log, goals)
 * so the next free-text message is routed to the right handler.
 */

export type SessionAction =
  | 'note'
  | 'research'
  | 'expense_amount'
  | 'expense_desc'
  | 'log_value'
  | 'goal_update';

export interface InputState {
  action: SessionAction;
  data: Record<string, any>;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes

const sessions = new Map<number, InputState>();

/** Track recently expired sessions to show "session expired" message */
const recentlyExpired = new Set<number>();

export function setSession(userId: number, action: SessionAction, data: Record<string, any> = {}): void {
  recentlyExpired.delete(userId);
  sessions.set(userId, { action, data, createdAt: Date.now() });
}

export function getSession(userId: number): InputState | undefined {
  const session = sessions.get(userId);
  if (!session) return undefined;

  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(userId);
    recentlyExpired.add(userId);
    // Auto-clear the expired flag after 60s
    setTimeout(() => recentlyExpired.delete(userId), 60_000);
    return undefined;
  }

  return session;
}

/** Check if a session just expired (one-shot — clears after reading) */
export function wasSessionExpired(userId: number): boolean {
  if (recentlyExpired.has(userId)) {
    recentlyExpired.delete(userId);
    return true;
  }
  return false;
}

export function clearSession(userId: number): void {
  sessions.delete(userId);
  recentlyExpired.delete(userId);
}
