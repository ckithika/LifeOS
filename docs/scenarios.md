# LifeOS Scenarios

LifeOS handles 63 scenarios across 9 categories. This document provides an overview — each scenario maps to specific tools, agents, and data flows.

## Categories

### A. Conversational (25 scenarios)
Things you ask Claude directly in a chat or Claude Project.

| # | Scenario | Key Tools |
|---|----------|-----------|
| A1 | Start a new project | `create_project`, `write_note` |
| A2 | "What's on my plate today?" | `daily_note`, `calendar_list`, `tasks_list`, `gmail_search` |
| A3 | Summarize a meeting | `read_note` (transcript) |
| A4 | Send meeting recap email | `gmail_draft`, `read_note` |
| A5 | Create tasks from meeting | `tasks_create`, `read_note` |
| A6 | Create deliverables from context | `read_note`, `gmail_read`, `write_note` |
| A7 | Search emails | `gmail_search`, `gmail_read` |
| A8 | Project status check | `read_note`, `tasks_list`, `gmail_search` |
| A9 | Schedule a meeting | `calendar_freebusy`, `contacts_lookup`, `calendar_create` |
| A10 | Organize Drive | `drive_list`, `drive_organize` |
| A11 | Find and file a document | `drive_list`, `drive_download`, `write_note` |
| A12 | Draft an email | `gmail_draft`, `contacts_lookup`, `read_note` |
| A13 | Research a topic | Agent Research |
| A14 | Compare options | Agent Research (competitive) |
| A15 | Deep business viability | Agent Research (full assessment) |
| A16-A25 | Weekly reviews, archival, check-ins, etc. | Various combinations |

### B. Post-Meeting Automated (6 scenarios)
Triggered automatically when Granola sends a meeting via Zapier.

| # | Scenario | Agent |
|---|----------|-------|
| B1 | Save transcript to vault | Granola Agent |
| B2 | Save summary to project note | Granola Agent |
| B3 | Extract and create tasks | Granola Agent (Claude API) |
| B4 | Draft recap email | Granola Agent (Claude API) |
| B5 | Detect scheduling language | Granola Agent |
| B6 | Generate suggested actions | Granola Agent (Claude API) |

### C. Background Scheduled (6 scenarios)
Run on a schedule by Cloud Scheduler.

| # | Scenario | Agent | Schedule |
|---|----------|-------|----------|
| C1 | Full sync (Gmail, Calendar, Tasks) | Sync Agent | 3x daily |
| C2 | File sync (Drive → vault) | Sync Agent | Every 4 hours |
| C3 | Drive organizer | Drive Org Agent | Daily 7am |
| C4 | Daily briefing | Briefing Agent | Daily 6:30am |
| C5 | Follow-up tracker | Briefing Agent | Part of daily briefing |
| C6 | One-time Drive cleanup | Drive Org Agent | Manual trigger |

### D. Research Agent (5 scenarios)
On-demand deep research.

| # | Scenario | Depth |
|---|----------|-------|
| D1 | Business idea viability | Deep (15-25 searches) |
| D2 | Technology/tool evaluation | Standard (10-15 searches) |
| D3 | Market/industry research | Standard-Deep |
| D4 | Person/company background | Quick-Standard |
| D5 | Competitive analysis | Standard-Deep |

### E. Claude Projects (3 scenarios)
Integration between Claude.ai Projects and the vault.

| # | Scenario |
|---|----------|
| E1 | New project → vault note created |
| E2 | Per-project context loaded on each conversation |
| E3 | Cross-project awareness via Dashboard |

### F. Calendar & Contacts (5 scenarios)
| # | Scenario |
|---|----------|
| F1 | Auto-create calendar invite from meeting |
| F2 | Create invite from email context |
| F3 | Create invite on instruction |
| F4 | Unified contact lookup |
| F5 | Find someone's email |

### G. File Management (4 scenarios)
| # | Scenario |
|---|----------|
| G1 | Email attachments → project folders |
| G2 | Google Docs → Markdown in vault |
| G3 | Create deliverables from context |
| G4 | Search files across all sources |

### H. Cross-Device (4 scenarios)
| # | Scenario |
|---|----------|
| H1 | iPhone quick capture → vault |
| H2 | Morning review on mobile |
| H3 | Post-meeting actions on mobile |
| H4 | Evening review on desktop |

### I. Notifications (5 scenarios)
| # | Scenario |
|---|----------|
| I1 | Daily briefing in vault |
| I2 | Urgent email alerts |
| I3 | Overdue task escalation |
| I4 | Meeting prep alerts |
| I5 | Follow-up reminders |
