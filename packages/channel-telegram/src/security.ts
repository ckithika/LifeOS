/**
 * Telegram bot security — user ID whitelist
 */

let allowedUsers: Set<number> | null = null;

function getAllowedUsers(): Set<number> {
  if (!allowedUsers) {
    const raw = process.env.TELEGRAM_ALLOWED_USERS || '';
    allowedUsers = new Set(
      raw.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id))
    );
  }
  return allowedUsers;
}

/**
 * Check if a Telegram user ID is authorized to use this bot.
 */
export function isAuthorizedUser(userId: number): boolean {
  const allowed = getAllowedUsers();
  if (allowed.size === 0) return false;
  return allowed.has(userId);
}
