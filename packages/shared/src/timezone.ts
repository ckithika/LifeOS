/**
 * Centralized timezone utility.
 *
 * Reads TIMEZONE from env (IANA format). Defaults to Africa/Nairobi.
 * All time formatting across the project should use these helpers.
 */

export function getTimezone(): string {
  return process.env.TIMEZONE || 'Africa/Nairobi';
}

/** Format a Date as "3:30 PM" in the configured timezone */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: getTimezone(),
  });
}

/** Format a Date as "Feb 20, 2026" in the configured timezone */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: getTimezone(),
  });
}

/** Get the current UTC offset string for the configured timezone, e.g. "+03:00" */
export function getUtcOffset(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: getTimezone(),
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const offset = parts.find(p => p.type === 'timeZoneName')?.value || '+00:00';
  // Convert "GMT+3" → "+03:00"
  const match = offset.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (match) {
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const mins = (match[3] || '0').padStart(2, '0');
    return `${sign}${hours}:${mins}`;
  }
  return '+00:00';
}
