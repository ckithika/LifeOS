/**
 * HTTP client for calling other LifeOS agents
 */

import type { AgentResponse } from './types.js';

/**
 * Call an agent endpoint and return the text response.
 */
export async function callAgent(
  baseUrl: string,
  path: string,
  body?: Record<string, unknown>
): Promise<AgentResponse> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      return { text: '', error: `Agent returned ${response.status}: ${error}` };
    }

    const data = await response.json() as Record<string, unknown>;
    return { text: JSON.stringify(data, null, 2) };
  } catch (error: any) {
    return { text: '', error: `Agent call failed: ${error.message}` };
  }
}

/**
 * Trigger the daily briefing agent.
 */
export async function triggerBriefing(date?: string): Promise<AgentResponse> {
  const url = process.env.AGENT_BRIEFING_URL;
  if (!url) return { text: '', error: 'AGENT_BRIEFING_URL not configured' };

  const query = date ? `?date=${date}` : '';
  return callAgent(url, `/briefing${query}`);
}

/**
 * Trigger the research agent.
 */
export async function triggerResearch(
  query: string,
  type = 'technology' as string,
  depth = 'quick' as string
): Promise<AgentResponse> {
  const url = process.env.AGENT_RESEARCH_URL;
  if (!url) return { text: '', error: 'AGENT_RESEARCH_URL not configured' };

  return callAgent(url, '/research', { query, type, depth });
}
