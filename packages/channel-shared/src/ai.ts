/**
 * AI orchestrator — routes to Gemini (primary) with Claude fallback.
 *
 * Gemini is the default provider (free tier). If it fails with a
 * transient error (429, 5xx, timeout, quota), falls back to Claude.
 */

import { routeTools, getActiveToolDefs } from './tools.js';
import { chatWithGemini } from './gemini.js';
import { chatWithClaude } from './claude.js';
import type { ChatOptions } from './types.js';

// ─── Fallback Logic ───────────────────────────────────────────

function shouldFallback(error: any): boolean {
  const message = (error?.message || '').toLowerCase();
  const status = error?.status ?? error?.statusCode ?? error?.code;

  // Don't fallback on auth/config errors (needs fixing, not retrying)
  if (status === 400 || status === 401 || status === 403) return false;

  // HTTP status-based
  if (status === 429) return true;                  // Rate limited
  if (status >= 500 && status <= 504) return true;  // Server errors

  // Google AI error codes
  if (message.includes('resource_exhausted')) return true;
  if (message.includes('quota')) return true;
  if (message.includes('rate limit')) return true;
  if (message.includes('overloaded')) return true;
  if (message.includes('timeout')) return true;
  if (message.includes('unavailable')) return true;
  if (message.includes('internal')) return true;
  if (message.includes('deadline exceeded')) return true;

  // Network errors
  if (error?.code === 'ETIMEDOUT') return true;
  if (error?.code === 'ECONNRESET') return true;
  if (error?.code === 'ENOTFOUND') return true;

  // Default: fallback on any unknown error (better to try Claude than fail)
  return true;
}

// ─── Main Chat Entry Point ────────────────────────────────────

export async function chat(userMessage: string, options: ChatOptions): Promise<string> {
  const { chatId, channelName } = options;
  const routedTools = routeTools(userMessage);

  // Check if Gemini is configured
  const hasGemini = !!process.env.GOOGLE_AI_API_KEY;

  if (hasGemini) {
    try {
      // Gemini Flash: use routed subset (better tool selection with fewer tools)
      return await chatWithGemini(userMessage, chatId, routedTools, channelName);
    } catch (geminiError: any) {
      if (!shouldFallback(geminiError)) {
        throw geminiError;
      }

      console.warn('[ai] Gemini failed, falling back to Claude:', geminiError.message);

      try {
        // Claude fallback: send all active tools (Opus handles large tool sets well)
        return await chatWithClaude(userMessage, chatId, getActiveToolDefs(), channelName);
      } catch (claudeError: any) {
        // Both providers failed — surface both errors
        console.error('[ai] Claude fallback also failed:', claudeError.message);
        throw new Error(
          `Gemini: ${geminiError.message}\nClaude fallback: ${claudeError.message}`
        );
      }
    }
  }

  // No Gemini key — use Claude directly with all active tools
  return await chatWithClaude(userMessage, chatId, getActiveToolDefs(), channelName);
}
