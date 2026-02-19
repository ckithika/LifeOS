/**
 * LifeOS — Multi-Account Google Auth Manager
 *
 * Manages OAuth2 tokens for multiple Google accounts.
 * Handles token refresh, per-account API client creation,
 * and the initial authorization flow for new accounts.
 */

import { google, Auth } from 'googleapis';
import { AccountConfig, GoogleTokens } from './types.js';
import { getAccounts, getTokenEnvKey } from './config.js';

/** Google API scopes required by LifeOS */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts.readonly',
];

// Cache of OAuth2 clients per account alias
const clientCache = new Map<string, Auth.OAuth2Client>();

/**
 * Create a base OAuth2 client (no tokens attached).
 */
function createBaseClient(): Auth.OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required. ' +
      'Create OAuth credentials at console.cloud.google.com'
    );
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/auth/callback'
  );
}

/**
 * Load tokens for a specific account from environment variables.
 */
function loadTokens(alias: string): GoogleTokens | null {
  const envKey = getTokenEnvKey(alias);
  const raw = process.env[envKey];

  if (!raw) return null;

  try {
    return JSON.parse(raw) as GoogleTokens;
  } catch {
    console.warn(`Failed to parse tokens for account "${alias}" from ${envKey}`);
    return null;
  }
}

/**
 * Get an authenticated OAuth2 client for a specific account.
 *
 * @param alias - Account alias (e.g., 'personal', 'work')
 * @returns Authenticated OAuth2 client
 * @throws If no tokens are found for the account
 */
export function getAuthClient(alias: string): Auth.OAuth2Client {
  // Check cache
  const cached = clientCache.get(alias);
  if (cached) return cached;

  const client = createBaseClient();
  const tokens = loadTokens(alias);

  if (!tokens) {
    throw new Error(
      `No Google tokens found for account "${alias}". ` +
      `Set ${getTokenEnvKey(alias)} in your .env file. ` +
      `Run 'npm run auth' to authorize accounts.`
    );
  }

  client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // Auto-refresh tokens
  client.on('tokens', (newTokens) => {
    console.log(`Tokens refreshed for account "${alias}"`);
    // In production, you'd persist these back to Secret Manager
    // For now, the refresh_token stays valid
    if (newTokens.refresh_token) {
      client.setCredentials({
        ...client.credentials,
        refresh_token: newTokens.refresh_token,
      });
    }
  });

  clientCache.set(alias, client);
  return client;
}

/**
 * Get authenticated API clients for a specific account.
 * Returns pre-configured Gmail, Calendar, Tasks, Drive, and People clients.
 */
export function getGoogleClients(alias: string) {
  const auth = getAuthClient(alias);

  return {
    gmail: google.gmail({ version: 'v1', auth }),
    calendar: google.calendar({ version: 'v3', auth }),
    tasks: google.tasks({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
    people: google.people({ version: 'v1', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
  };
}

/**
 * Get Google clients for all configured accounts.
 * Returns a map of alias → clients.
 */
export function getAllGoogleClients(): Map<string, ReturnType<typeof getGoogleClients>> {
  const accounts = getAccounts();
  const allClients = new Map<string, ReturnType<typeof getGoogleClients>>();

  for (const account of accounts) {
    try {
      allClients.set(account.alias, getGoogleClients(account.alias));
    } catch (error) {
      console.warn(
        `Skipping account "${account.alias}" (${account.email}): ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  return allClients;
}

/**
 * Generate the OAuth authorization URL for a new account.
 * The user visits this URL to grant access.
 */
export function getAuthUrl(state?: string): string {
  const client = createBaseClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent', // Force consent to get refresh token
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 * Used during the initial setup flow.
 */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const client = createBaseClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received. Make sure to use prompt=consent ' +
      'and access_type=offline in the auth URL.'
    );
  }

  return {
    access_token: tokens.access_token || '',
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date || undefined,
  };
}

/**
 * Verify that tokens for an account are still valid.
 */
export async function verifyTokens(alias: string): Promise<boolean> {
  try {
    const clients = getGoogleClients(alias);
    // Quick check: get Gmail profile
    await clients.gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Alias for getAllGoogleClients — used by agents for readability.
 */
export function getAllAccountClients(): Map<string, ReturnType<typeof getGoogleClients>> {
  return getAllGoogleClients();
}

/**
 * Clear the client cache (useful for testing or after token rotation).
 */
export function clearAuthCache(): void {
  clientCache.clear();
}
