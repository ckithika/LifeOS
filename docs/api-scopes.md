# Google API Scopes

LifeOS requires the following OAuth scopes for each connected Google account.

## Required Scopes

| Scope | API | Used By | Purpose |
|-------|-----|---------|---------|
| `gmail.readonly` | Gmail API | MCP Google, Agent Sync, Agent Briefing | Read emails, search, list threads |
| `gmail.compose` | Gmail API | MCP Google, Agent Granola | Create draft emails |
| `gmail.modify` | Gmail API | MCP Google | Modify labels, mark read/unread |
| `calendar` | Calendar API | MCP Google, Agent Briefing | Read calendar events |
| `calendar.events` | Calendar API | MCP Google | Create and update events |
| `tasks` | Tasks API | MCP Google, Agent Granola, Agent Briefing | Full CRUD on tasks |
| `drive` | Drive API | MCP Google, Agent Sync, Agent Drive Org | Read, write, organize files |
| `contacts.readonly` | People API | MCP Google | Search contacts by name |

## Full Scope URLs

```
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/gmail.modify
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/tasks
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/contacts.readonly
```

## Notes

- All scopes are requested during the OAuth flow (`npm run auth`)
- Workspace accounts may require admin approval for some scopes
- The `drive` scope grants full read/write access — there is no read-only Drive scope that supports file download
- `contacts.readonly` only allows reading contacts, not creating or modifying them
