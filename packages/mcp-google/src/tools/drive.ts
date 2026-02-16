/**
 * Drive Tools — List, Download, Upload, Organize
 *
 * Multi-account Google Drive access with file sync support.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getAccounts,
  getGoogleClients,
  getAccount,
  DriveFile,
  getFileSizeLimit,
} from '@lifeos/shared';

export function registerDriveTools(server: McpServer) {

  // ─── drive_list ─────────────────────────────────────────────

  server.tool(
    'drive_list',
    'List and search files in Google Drive across accounts. Supports search by name, content, type, and folder.',
    {
      query: z.string().optional().describe('Search query (Drive search syntax: name contains, fullText contains, mimeType, etc)'),
      account: z.string().optional().describe('Account alias (omit for all)'),
      folderId: z.string().optional().describe('Folder ID to list contents of'),
      maxResults: z.number().default(20).describe('Max results per account'),
      mimeType: z.string().optional().describe('Filter by MIME type (e.g., "application/pdf")'),
    },
    async ({ query, account, folderId, maxResults, mimeType }) => {
      try {
        const accounts = account
          ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
          : getAccounts();

        const allFiles: DriveFile[] = [];

        for (const acct of accounts) {
          if (!acct) continue;
          try {
            const clients = getGoogleClients(acct.alias);

            // Build query
            const queryParts: string[] = ['trashed = false'];
            if (query) queryParts.push(`(name contains '${query}' or fullText contains '${query}')`);
            if (folderId) queryParts.push(`'${folderId}' in parents`);
            if (mimeType) queryParts.push(`mimeType = '${mimeType}'`);

            const response = await clients.drive.files.list({
              q: queryParts.join(' and '),
              pageSize: maxResults,
              fields: 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
              orderBy: 'modifiedTime desc',
            });

            for (const file of response.data.files || []) {
              allFiles.push({
                id: file.id || '',
                account: acct.alias,
                name: file.name || '',
                mimeType: file.mimeType || '',
                size: file.size ? parseInt(file.size, 10) : undefined,
                modifiedTime: file.modifiedTime || '',
                parents: file.parents || undefined,
                webViewLink: file.webViewLink || undefined,
              });
            }
          } catch (error) {
            console.warn(`Drive error for ${acct.alias}:`, error);
          }
        }

        if (allFiles.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No files found.' }] };
        }

        const formatted = allFiles.map(f => {
          const size = f.size ? `${Math.round(f.size / 1024)}KB` : '';
          const modified = f.modifiedTime ? f.modifiedTime.split('T')[0] : '';
          return `**${f.name}** (${f.account}) ${size} ${modified}\n  Type: ${f.mimeType}\n  ID: ${f.id}${f.webViewLink ? `\n  ${f.webViewLink}` : ''}`;
        }).join('\n\n');

        return { content: [{ type: 'text' as const, text: `${allFiles.length} files:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_list failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── drive_download ─────────────────────────────────────────

  server.tool(
    'drive_download',
    'Download a file from Google Drive. For Google Docs/Sheets/Slides, exports to the specified format.',
    {
      fileId: z.string().describe('Drive file ID'),
      account: z.string().describe('Account alias'),
      exportFormat: z.string().optional().describe('Export format for Google Workspace files (e.g., "text/markdown", "text/csv", "application/pdf")'),
    },
    async ({ fileId, account, exportFormat }) => {
      try {
        const clients = getGoogleClients(account);

        // Get file metadata first
        const meta = await clients.drive.files.get({
          fileId,
          fields: 'id,name,mimeType,size',
        });

        const mimeType = meta.data.mimeType || '';
        const name = meta.data.name || 'file';
        const size = meta.data.size ? parseInt(meta.data.size, 10) : 0;

        // Check size limit
        if (size > getFileSizeLimit()) {
          return {
            content: [{
              type: 'text' as const,
              text: `File "${name}" (${Math.round(size / 1024 / 1024)}MB) exceeds sync limit. Use the Drive link instead.`,
            }],
          };
        }

        // Google Workspace files need export
        const isWorkspaceFile = mimeType.startsWith('application/vnd.google-apps.');
        let content: string;

        if (isWorkspaceFile) {
          const format = exportFormat || getDefaultExportFormat(mimeType);
          const response = await clients.drive.files.export({
            fileId,
            mimeType: format,
          }, { responseType: 'text' });

          content = response.data as string;
        } else {
          const response = await clients.drive.files.get({
            fileId,
            alt: 'media',
          }, { responseType: 'text' });

          content = response.data as string;
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Downloaded: ${name}\n\n${content.slice(0, 10000)}${content.length > 10000 ? '\n...(truncated)' : ''}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_download failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── drive_upload ───────────────────────────────────────────

  // @ts-ignore TS2589: deep type instantiation varies by TS version
  server.tool(
    'drive_upload',
    'Upload a file to Google Drive.',
    {
      name: z.string().describe('File name'),
      content: z.string().describe('File content (text content or base64 for binary)'),
      account: z.string().describe('Account alias'),
      mimeType: z.string().default('text/plain').describe('MIME type of the content'),
      folderId: z.string().optional().describe('Parent folder ID'),
    },
    async ({ name, content, account, mimeType, folderId }) => {
      try {
        const clients = getGoogleClients(account);

        const response = await clients.drive.files.create({
          requestBody: {
            name,
            parents: folderId ? [folderId] : undefined,
          },
          media: {
            mimeType,
            body: content,
          },
          fields: 'id,name,webViewLink',
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Uploaded "${name}" to ${account} Drive\n  ID: ${response.data.id}${response.data.webViewLink ? `\n  Link: ${response.data.webViewLink}` : ''}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_upload failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── drive_create_folder ─────────────────────────────────────

  server.tool(
    'drive_create_folder',
    'Create a new folder in Google Drive. Returns the folder ID for use with drive_upload and drive_organize.',
    {
      name: z.string().describe('Folder name'),
      account: z.string().describe('Account alias'),
      parentId: z.string().optional().describe('Parent folder ID (omit for root)'),
    },
    async ({ name, account, parentId }) => {
      try {
        const clients = getGoogleClients(account);

        const response = await clients.drive.files.create({
          requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : undefined,
          },
          fields: 'id,name,webViewLink',
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Created folder "${name}" in ${account} Drive\n  ID: ${response.data.id}${response.data.webViewLink ? `\n  Link: ${response.data.webViewLink}` : ''}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_create_folder failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── drive_organize ─────────────────────────────────────────

  server.tool(
    'drive_organize',
    'Move or rename files in Google Drive. Use for organizing files into project folders.',
    {
      fileId: z.string().describe('File ID to move/rename'),
      account: z.string().describe('Account alias'),
      newName: z.string().optional().describe('New file name'),
      newParentId: z.string().optional().describe('New parent folder ID'),
      removeFromParentId: z.string().optional().describe('Current parent folder ID to remove from'),
    },
    async ({ fileId, account, newName, newParentId, removeFromParentId }) => {
      try {
        const clients = getGoogleClients(account);

        const updateBody: Record<string, any> = {};
        if (newName) updateBody.name = newName;

        await clients.drive.files.update({
          fileId,
          requestBody: updateBody,
          addParents: newParentId,
          removeParents: removeFromParentId,
          fields: 'id,name,parents',
        });

        const actions = [];
        if (newName) actions.push(`renamed to "${newName}"`);
        if (newParentId) actions.push(`moved to folder ${newParentId}`);

        return {
          content: [{ type: 'text' as const, text: `File ${fileId}: ${actions.join(', ')}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_organize failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
  // ─── drive_delete ───────────────────────────────────────────

  server.tool(
    'drive_delete',
    'Move a file or folder to trash in Google Drive. Use with caution — this is reversible from the Drive trash within 30 days.',
    {
      fileId: z.string().describe('File or folder ID to trash'),
      account: z.string().describe('Account alias'),
    },
    async ({ fileId, account }) => {
      try {
        const clients = getGoogleClients(account);

        // Get name first for confirmation message
        const meta = await clients.drive.files.get({
          fileId,
          fields: 'id,name,mimeType',
        });

        const name = meta.data.name || fileId;
        const isFolder = meta.data.mimeType === 'application/vnd.google-apps.folder';

        await clients.drive.files.update({
          fileId,
          requestBody: { trashed: true },
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Trashed ${isFolder ? 'folder' : 'file'} "${name}" in ${account} Drive (recoverable from trash for 30 days)`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `drive_delete failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}

// ─── Helpers ────────────────────────────────────────────────

function getDefaultExportFormat(mimeType: string): string {
  const exportMap: Record<string, string> = {
    'application/vnd.google-apps.document': 'text/markdown',
    'application/vnd.google-apps.spreadsheet': 'text/csv',
    'application/vnd.google-apps.presentation': 'application/pdf',
    'application/vnd.google-apps.drawing': 'image/png',
  };
  return exportMap[mimeType] || 'application/pdf';
}
