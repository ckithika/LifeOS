/**
 * Retry utility with exponential backoff for transient failures.
 */

export interface RetryOptions {
  retries?: number;
  baseDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const { retries = 3, baseDelay = 1000, onRetry } = opts;
  let lastError: Error = new Error('Unknown');

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < retries && isRetryable(error)) {
        onRetry?.(error, attempt + 1);
        await sleep(baseDelay * Math.pow(2, attempt));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

function isRetryable(error: any): boolean {
  const status = error.status || error.response?.status || error.statusCode;
  if (status === 429 || (status >= 500 && status <= 504)) return true;
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') return true;
  const msg = (error.message || '').toLowerCase();
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('timeout')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
