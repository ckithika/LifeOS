/**
 * LifeOS — Google Provider
 *
 * Google OAuth provider for the account management CLI.
 * Extracted from scripts/auth-google.ts for reuse.
 */

import { createServer, type Server } from 'http';
import { exec } from 'child_process';
import { URL } from 'url';
import { google } from 'googleapis';
import type { ProviderDefinition, AuthResult } from '../types.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/contacts.readonly',
];

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

function getTokenEnvKey(alias: string): string {
  return `GOOGLE_TOKEN_${alias.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

function getOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env\n' +
      'See docs/setup-guide.md for instructions.'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

async function authenticate(alias: string, _email: string): Promise<AuthResult> {
  const oauth2Client = getOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: alias,
  });

  return new Promise<AuthResult>((resolve, reject) => {
    let server: Server;

    server = createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:${PORT}`);

      if (url.pathname !== '/auth/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        res.writeHead(400);
        res.end('Missing authorization code');
        reject(new Error('Missing authorization code'));
        server.close();
        return;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>Authorization Successful!</h1>
              <p>Account <strong>${alias}</strong> has been authorized.</p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        if (!tokens.refresh_token) {
          server.close();
          reject(new Error(
            'No refresh token received.\n' +
            'You may need to revoke access first: https://myaccount.google.com/permissions'
          ));
          return;
        }

        const envKey = getTokenEnvKey(alias);
        const tokenJson = JSON.stringify({
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token || '',
          expiry_date: tokens.expiry_date || undefined,
        });

        setTimeout(() => {
          server.close();
          resolve({ envKey, envValue: tokenJson });
        }, 500);
      } catch (error: any) {
        res.writeHead(500);
        res.end(`Authorization failed: ${error.message}`);
        server.close();
        reject(error);
      }
    });

    server.listen(PORT, () => {
      console.log(`\n  Open this URL in your browser:\n`);
      console.log(`  ${authUrl}\n`);
      console.log(`  Waiting for authorization callback on port ${PORT}...`);

      const openCmd = process.platform === 'darwin' ? 'open' :
                      process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${openCmd} "${authUrl}"`);
    });
  });
}

async function verify(alias: string): Promise<boolean> {
  try {
    const tokenEnvKey = getTokenEnvKey(alias);
    const raw = process.env[tokenEnvKey];
    if (!raw) return false;

    const tokens = JSON.parse(raw);
    const client = getOAuth2Client();
    client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: client });
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch {
    return false;
  }
}

export const googleProvider: ProviderDefinition = {
  id: 'google',
  displayName: 'Google (Gmail, Calendar, Drive, Tasks, Contacts)',
  authMethod: 'oauth2',
  supportedAccountTypes: ['personal', 'workspace'],
  authenticate,
  getTokenEnvKey,
  verify,
};
