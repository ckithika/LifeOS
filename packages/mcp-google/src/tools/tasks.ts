/**
 * Tasks Tools — List, Create, Update
 *
 * Google Tasks with multi-account support.
 * Primary account is the default for task creation.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getAccounts,
  getGoogleClients,
  getDefaultTasksAccount,
  TaskItem,
} from '@lifeos/shared';

export function registerTasksTools(server: McpServer) {

  // ─── tasks_list ─────────────────────────────────────────────

  server.tool(
    'tasks_list',
    'List tasks across all accounts. Shows task title, due date, status, and which account they belong to.',
    {
      account: z.string().optional().describe('Account alias (omit for all)'),
      showCompleted: z.boolean().default(false).describe('Include completed tasks'),
      dueMin: z.string().optional().describe('Minimum due date (ISO 8601)'),
      dueMax: z.string().optional().describe('Maximum due date (ISO 8601)'),
      maxResults: z.number().default(50).describe('Max results per task list'),
    },
    async ({ account, showCompleted, dueMin, dueMax, maxResults }) => {
      try {
        const accounts = account
          ? [getAccounts().find(a => a.alias === account)].filter(Boolean)
          : getAccounts();

        const allTasks: TaskItem[] = [];

        for (const acct of accounts) {
          if (!acct) continue;
          try {
            const clients = getGoogleClients(acct.alias);

            // Get all task lists
            const taskLists = await clients.tasks.tasklists.list();

            for (const list of taskLists.data.items || []) {
              const tasks = await clients.tasks.tasks.list({
                tasklist: list.id!,
                showCompleted,
                showHidden: false,
                maxResults,
                dueMin,
                dueMax,
              });

              for (const task of tasks.data.items || []) {
                allTasks.push({
                  id: task.id || '',
                  account: acct.alias,
                  taskListId: list.id || '',
                  title: task.title || '',
                  notes: task.notes ?? undefined,
                  due: task.due ?? undefined,
                  status: (task.status as 'needsAction' | 'completed') || 'needsAction',
                  completed: task.completed ?? undefined,
                  parent: task.parent ?? undefined,
                });
              }
            }
          } catch (error) {
            console.warn(`Tasks error for ${acct.alias}:`, error);
          }
        }

        if (allTasks.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No tasks found.' }] };
        }

        // Sort: incomplete first, then by due date
        allTasks.sort((a, b) => {
          if (a.status !== b.status) return a.status === 'needsAction' ? -1 : 1;
          return (a.due || '9999').localeCompare(b.due || '9999');
        });

        const formatted = allTasks.map(t => {
          const check = t.status === 'completed' ? '[done]' : '[ ]';
          const due = t.due ? ` (due: ${t.due.split('T')[0]})` : '';
          return `${check} ${t.title}${due} [${t.account}] {id: ${t.id}}`;
        }).join('\n');

        return { content: [{ type: 'text' as const, text: `${allTasks.length} tasks:\n\n${formatted}` }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `tasks_list failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── tasks_create ───────────────────────────────────────────

  server.tool(
    'tasks_create',
    'Create a new task. Defaults to the primary tasks account.',
    {
      title: z.string().describe('Task title'),
      notes: z.string().optional().describe('Task description/notes'),
      due: z.string().optional().describe('Due date (ISO 8601, e.g., "2026-02-20T00:00:00Z")'),
      account: z.string().optional().describe('Account alias (defaults to primary tasks account)'),
      taskList: z.string().optional().describe('Task list ID (defaults to primary list)'),
    },
    async ({ title, notes, due, account, taskList }) => {
      try {
        const acct = account
          ? getAccounts().find(a => a.alias === account)
          : getDefaultTasksAccount();

        if (!acct) {
          return { content: [{ type: 'text' as const, text: `Account "${account}" not found.` }], isError: true };
        }

        const clients = getGoogleClients(acct.alias);

        // Get default task list if not specified
        let listId = taskList;
        if (!listId) {
          const lists = await clients.tasks.tasklists.list();
          listId = lists.data.items?.[0]?.id || '@default';
        }

        const task = await clients.tasks.tasks.insert({
          tasklist: listId,
          requestBody: {
            title,
            notes,
            due,
          },
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Task created on ${acct.alias}:\n  "${title}"${due ? `\n  Due: ${due.split('T')[0]}` : ''}\n  ID: ${task.data.id}`,
          }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `tasks_create failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );

  // ─── tasks_update ───────────────────────────────────────────

  server.tool(
    'tasks_update',
    'Update or complete a task. Can change title, notes, due date, or mark as completed.',
    {
      taskId: z.string().describe('Task ID'),
      account: z.string().describe('Account alias'),
      taskList: z.string().optional().describe('Task list ID (defaults to primary)'),
      title: z.string().optional().describe('New title'),
      notes: z.string().optional().describe('New notes'),
      due: z.string().optional().describe('New due date'),
      completed: z.boolean().optional().describe('Mark as completed (true) or uncomplete (false)'),
    },
    async ({ taskId, account, taskList, title, notes, due, completed }) => {
      try {
        const clients = getGoogleClients(account);

        // Get task list if not specified
        let listId = taskList;
        if (!listId) {
          const lists = await clients.tasks.tasklists.list();
          listId = lists.data.items?.[0]?.id || '@default';
        }

        const updateBody: Record<string, any> = {};
        if (title !== undefined) updateBody.title = title;
        if (notes !== undefined) updateBody.notes = notes;
        if (due !== undefined) updateBody.due = due;
        if (completed === true) {
          updateBody.status = 'completed';
          updateBody.completed = new Date().toISOString();
        } else if (completed === false) {
          updateBody.status = 'needsAction';
          updateBody.completed = null;
        }

        await clients.tasks.tasks.patch({
          tasklist: listId,
          task: taskId,
          requestBody: updateBody,
        });

        const changes = Object.keys(updateBody).join(', ');
        return {
          content: [{ type: 'text' as const, text: `Task updated (${changes}): ${taskId}` }],
        };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: `tasks_update failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
      }
    }
  );
}
