/**
 * LifeOS — Google Multi-Account MCP Server
 *
 * Exposes Gmail, Calendar, Tasks, Drive, and Contacts across
 * multiple Google accounts as MCP tools.
 *
 * Runs on Google Cloud Run with Streamable HTTP transport.
 *
 * Tools (16 total):
 * - Gmail: search, read, draft, attachments
 * - Calendar: list, create, freebusy
 * - Tasks: list, create, update
 * - Drive: list, download, upload, organize
 * - Contacts: search, lookup
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import 'dotenv/config';

import { loadAccounts } from '@lifeos/shared';
import { registerGmailTools } from './tools/gmail.js';
import { registerCalendarTools } from './tools/calendar.js';
import { registerTasksTools } from './tools/tasks.js';
import { registerDriveTools } from './tools/drive.js';
import { registerContactsTools } from './tools/contacts.js';

// ─── Initialize ─────────────────────────────────────────────

// Validate configuration on startup
const accounts = loadAccounts();
console.log(`Loaded ${accounts.length} Google account(s): ${accounts.map(a => a.alias).join(', ')}`);

// ─── Create per-request MCP server ──────────────────────────

function createMcpServer() {
  const server = new McpServer({
    name: 'lifeos-google',
    version: '0.1.0',
  });
  registerGmailTools(server);
  registerCalendarTools(server);
  registerTasksTools(server);
  registerDriveTools(server);
  registerContactsTools(server);
  return server;
}

console.log('Registered 16 MCP tools (Gmail: 4, Calendar: 3, Tasks: 3, Drive: 4, Contacts: 2)');

// ─── HTTP Server with Streamable HTTP Transport ─────────────

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: 'lifeos-mcp-google',
    version: '0.1.0',
    accounts: accounts.map(a => ({
      alias: a.alias,
      email: a.email,
      type: a.type,
    })),
  });
});

// Helper: create a fresh server+transport per request (stateless for Cloud Run)
async function handleMcpRequest(req: express.Request, res: express.Response) {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

// MCP endpoints at both / and /mcp (Claude.ai hits /)
app.post('/', handleMcpRequest);
app.post('/mcp', handleMcpRequest);

app.get('/', handleMcpRequest);
app.get('/mcp', handleMcpRequest);

app.delete('/', (_req, res) => res.status(200).json({ ok: true }));
app.delete('/mcp', (_req, res) => res.status(200).json({ ok: true }));

const port = parseInt(process.env.PORT || '3002', 10);

app.listen(port, () => {
  console.log(`LifeOS Google MCP server running on port ${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`Health check: http://localhost:${port}/health`);
});
