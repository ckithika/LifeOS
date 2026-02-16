/**
 * LifeOS — Obsidian MCP Server
 *
 * Exposes the Obsidian vault (stored on GitHub) as MCP tools.
 * Runs on Google Cloud Run with Streamable HTTP transport.
 *
 * Tools:
 * - read_note: Read any file from the vault
 * - write_note: Create or update vault files
 * - delete_note: Delete a file from the vault
 * - move_note: Move or rename a file in the vault
 * - search_vault: Full-text search across the vault
 * - list_projects: List all projects with status
 * - create_project: Create new project from template
 * - list_files: Browse the Files/ directory tree
 * - daily_note: Read or append to today's daily note
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';
import 'dotenv/config';

import {
  readFile,
  writeFile,
  appendToFile,
  deleteFile,
  searchVault,
  listDirectory,
  listProjects,
  createProject,
  getDailyNote,
} from '@lifeos/shared';

// ─── Register all tools on a server instance ────────────────

function registerTools(server: McpServer) {

// ─── Tool: read_note ────────────────────────────────────────

// @ts-ignore TS2589: deep type instantiation varies by TS version
server.tool(
  'read_note',
  'Read a file from the Obsidian vault. Use paths relative to vault root (e.g., "Projects/Work/esp/README.md", "Daily/2026-02-15.md").',
  {
    path: z.string().describe('File path relative to vault root'),
  },
  async ({ path }) => {
    try {
      const file = await readFile(path);

      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${path}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: file.content }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error reading ${path}: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: write_note ───────────────────────────────────────

server.tool(
  'write_note',
  'Create or update a file in the Obsidian vault. Overwrites the entire file content. For appending, use daily_note instead.',
  {
    path: z.string().describe('File path relative to vault root'),
    content: z.string().describe('Complete file content to write'),
    message: z.string().optional().describe('Commit message (auto-generated if omitted)'),
  },
  async ({ path, content, message }) => {
    try {
      const sha = await writeFile(path, content, message);
      return {
        content: [{ type: 'text' as const, text: `Written to ${path} (sha: ${sha.slice(0, 7)})` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error writing ${path}: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: search_vault ─────────────────────────────────────

server.tool(
  'search_vault',
  'Search for content across the entire Obsidian vault. Returns matching files with context snippets.',
  {
    query: z.string().describe('Search query (searches file contents)'),
  },
  async ({ query }) => {
    try {
      const results = await searchVault(query);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No results found for: "${query}"` }],
        };
      }

      const formatted = results
        .map(r => {
          const snippets = r.matches.length > 0
            ? r.matches.map(m => `  > ${m}`).join('\n')
            : '  (no preview)';
          return `**${r.path}**\n${snippets}`;
        })
        .join('\n\n');

      return {
        content: [{ type: 'text' as const, text: `Found ${results.length} results:\n\n${formatted}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Search error: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: list_projects ────────────────────────────────────

server.tool(
  'list_projects',
  'List all projects in the vault. Projects are folders with README.md under Projects/{category}/.',
  {},
  async () => {
    try {
      const projects = await listProjects();

      if (projects.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No projects found in Projects/ directory.' }],
        };
      }

      const formatted = projects
        .map(p => `- **${p.title}** [${p.status}] ${p.category ? `(${p.category})` : ''} — ${p.folderPath || p.path}`)
        .join('\n');

      return {
        content: [{ type: 'text' as const, text: `${projects.length} projects:\n\n${formatted}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error listing projects: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: create_project ───────────────────────────────────

server.tool(
  'create_project',
  'Create a new project folder with README.md, meeting-notes.md, configured subfolders, and dashboard entry. Returns the project path.',
  {
    slug: z.string().describe('URL-safe project slug (e.g., "new-product-launch")'),
    title: z.string().describe('Human-readable project title'),
    category: z.string().optional().describe('Project category folder (e.g., "Work", "Personal"). Defaults to first configured category.'),
  },
  async ({ slug, title, category }) => {
    try {
      const project = await createProject(slug, title, category);

      // Update Dashboard.md
      try {
        const dashboard = await readFile('Dashboard.md');
        if (dashboard) {
          const cat = project.category || category || 'Consulting';
          const entry = `| ${title} | active | ${cat} | [→](Projects/${cat}/${slug}/README.md) |\n`;
          const updatedContent = dashboard.content.includes('| Project |')
            ? dashboard.content.replace(
                /(\| Project \|.*\n\|[-| ]+\n)/,
                `$1${entry}`
              )
            : dashboard.content + `\n${entry}`;
          await writeFile('Dashboard.md', updatedContent, `lifeos: add ${slug} to dashboard`);
        }
      } catch {
        // Dashboard update is best-effort
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Created project "${title}":\n- Folder: ${project.folderPath}/\n- README: ${project.path}\n- Added to Dashboard.md`,
        }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : 'unknown error'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: list_files ───────────────────────────────────────

server.tool(
  'list_files',
  'Browse files in the vault. Lists contents of any directory. Project files are inside project folders (Projects/{category}/{slug}/files/). System files are in Files/.',
  {
    path: z.string().optional().describe('Directory path to list (default: "Files")'),
  },
  async ({ path }) => {
    try {
      const dirPath = path || 'Files';
      const entries = await listDirectory(dirPath);

      if (entries.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `Directory is empty or not found: ${dirPath}` }],
        };
      }

      const formatted = entries
        .map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`)
        .join('\n');

      return {
        content: [{ type: 'text' as const, text: `Contents of ${dirPath}/:\n\n${formatted}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error listing files: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: daily_note ───────────────────────────────────────

server.tool(
  'daily_note',
  'Read or append to today\'s daily note (or a specific date). Creates the note from template if it doesn\'t exist.',
  {
    date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today)'),
    append: z.string().optional().describe('Content to append to the daily note. Omit to just read.'),
    section: z.string().optional().describe('Section to append under (e.g., "Notes", "Suggested Actions"). Appends to end if section not found.'),
  },
  async ({ date, append, section }) => {
    try {
      const note = await getDailyNote(date);

      if (!append) {
        return {
          content: [{ type: 'text' as const, text: note.content }],
        };
      }

      // Append content
      let newContent = note.content;

      if (section) {
        // Try to find the section and append under it
        const sectionHeader = `## ${section}`;
        const sectionIndex = newContent.indexOf(sectionHeader);

        if (sectionIndex !== -1) {
          // Find the next section (## header) or end of file
          const afterSection = newContent.indexOf('\n## ', sectionIndex + sectionHeader.length);
          const insertPoint = afterSection !== -1 ? afterSection : newContent.length;

          newContent =
            newContent.slice(0, insertPoint) +
            '\n' + append + '\n' +
            newContent.slice(insertPoint);
        } else {
          // Section not found, append to end
          newContent += '\n' + append + '\n';
        }
      } else {
        newContent += '\n' + append + '\n';
      }

      await writeFile(note.path, newContent, `lifeos: update daily note ${note.date}`);

      return {
        content: [{ type: 'text' as const, text: `Appended to ${note.path}${section ? ` under "${section}"` : ''}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error with daily note: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: delete_note ──────────────────────────────────────

server.tool(
  'delete_note',
  'Delete a file from the Obsidian vault. This is permanent (though recoverable via git history).',
  {
    path: z.string().describe('File path relative to vault root'),
  },
  async ({ path }) => {
    try {
      await deleteFile(path);
      return {
        content: [{ type: 'text' as const, text: `Deleted: ${path}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error deleting ${path}: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: move_note ────────────────────────────────────────

server.tool(
  'move_note',
  'Move or rename a file in the Obsidian vault. Copies content to the new path and deletes the original.',
  {
    from: z.string().describe('Current file path relative to vault root'),
    to: z.string().describe('New file path relative to vault root'),
  },
  async ({ from, to }) => {
    try {
      const file = await readFile(from);
      if (!file) {
        return {
          content: [{ type: 'text' as const, text: `File not found: ${from}` }],
          isError: true,
        };
      }

      // Write to new location
      await writeFile(to, file.content, `lifeos: move ${from} → ${to}`);
      // Delete original
      await deleteFile(from, `lifeos: move ${from} → ${to} (cleanup)`);

      return {
        content: [{ type: 'text' as const, text: `Moved: ${from} → ${to}` }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: `Error moving ${from}: ${error instanceof Error ? error.message : 'unknown'}` }],
        isError: true,
      };
    }
  }
);

} // end registerTools

// ─── HTTP Server with Streamable HTTP Transport ─────────────

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'lifeos-mcp-obsidian', version: '0.1.0' });
});

// Helper: create a fresh server+transport per request (stateless for Cloud Run)
async function handleMcpRequest(req: express.Request, res: express.Response) {
  try {
    const mcpServer = new McpServer({
      name: 'lifeos-obsidian',
      version: '0.1.0',
    });

    // Re-register tools on this instance
    registerTools(mcpServer);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);
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

const port = parseInt(process.env.PORT || '3001', 10);

app.listen(port, () => {
  console.log(`LifeOS Obsidian MCP server running on port ${port}`);
  console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  console.log(`Health check: http://localhost:${port}/health`);
});
