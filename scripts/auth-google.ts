/**
 * Google OAuth Authorization Flow
 *
 * Helps you obtain refresh tokens for each Google account.
 * Run with: npm run auth
 *
 * Usage:
 *   npm run auth                    # Interactive: choose account to authorize
 *   npm run auth -- --alias=personal  # Authorize a specific account
 */

import { createServer } from 'http';
import { exec } from 'child_process';
import { URL } from 'url';
import { google } from 'googleapis';
import 'dotenv/config';

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

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('❌ Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env');
    console.error('   See docs/setup-guide.md for instructions.');
    process.exit(1);
  }

  // Parse alias from command line args
  const aliasArg = process.argv.find((a) => a.startsWith('--alias='));
  const alias = aliasArg?.split('=')[1] ?? 'personal';

  console.log(`\n🔑 LifeOS Google OAuth Setup`);
  console.log(`   Authorizing account: ${alias}`);
  console.log(`   Scopes: ${SCOPES.length} (Gmail, Calendar, Tasks, Drive, Contacts)\n`);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: alias,
  });

  // Start a temporary server to receive the callback
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state') ?? alias;

      if (!code) {
        res.writeHead(400);
        res.end('Missing authorization code');
        return;
      }

      try {
        const { tokens } = await oauth2Client.getToken(code);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto;">
              <h1>✅ Authorization Successful!</h1>
              <p>Account <strong>${state}</strong> has been authorized.</p>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        if (!tokens.refresh_token) {
          console.error('\n❌ No refresh token received.');
          console.error('   You may need to revoke access first:');
          console.error('   https://myaccount.google.com/permissions\n');
          server.close();
          process.exit(1);
        }

        const envKey = `GOOGLE_TOKEN_${state.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
        const tokenJson = JSON.stringify({
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token || '',
          expiry_date: tokens.expiry_date || undefined,
        });

        console.log(`\n✅ Authorization successful for "${state}"!\n`);
        console.log(`Add this to your .env file:\n`);
        console.log(`${envKey}='${tokenJson}'\n`);

        // Give the browser time to load the response
        setTimeout(() => {
          server.close();
          process.exit(0);
        }, 1000);
      } catch (error: any) {
        res.writeHead(500);
        res.end(`Authorization failed: ${error.message}`);
        console.error('❌ Token exchange failed:', error.message);
        server.close();
        process.exit(1);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(PORT, () => {
    console.log(`📌 Open this URL in your browser:\n`);
    console.log(`   ${authUrl}\n`);
    console.log(`Waiting for authorization callback on port ${PORT}...`);

    // Try to open the URL automatically
    const openCmd = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} "${authUrl}"`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
