/**
 * User-friendly error formatting.
 *
 * Maps common API/network errors to actionable messages.
 */

export function formatUserError(error: any): string {
  const status = error.status || error.response?.status || error.statusCode;
  const msg = (error.message || '').toLowerCase();

  // Rate limiting
  if (status === 429 || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
    return 'Rate limited — too many requests. Try again in a minute.';
  }

  // Auth errors
  if (status === 401 || status === 403) {
    return 'Authentication error — a Google account may need re-authorization. Run: npm run auth';
  }

  // Quota
  if (msg.includes('quota')) {
    return 'API quota exceeded for today. Try again tomorrow or check Google Cloud quotas.';
  }

  // Not found
  if (status === 404) {
    return 'Not found — the requested resource doesn\'t exist.';
  }

  // Server errors
  if (status >= 500 && status <= 504) {
    return 'Service temporarily unavailable. Try again shortly.';
  }

  // Network
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || msg.includes('timeout')) {
    return 'Connection timed out. Try again.';
  }
  if (error.code === 'ENOTFOUND') {
    return 'Network error — check your internet connection.';
  }

  // AI-specific
  if (msg.includes('gemini') && msg.includes('claude')) {
    return 'Both AI providers are unavailable right now. Try again in a minute.';
  }

  // Default: return the original message but cleaned up
  return error.message || 'Something went wrong. Try again.';
}
