/**
 * LifeOS — Shared Type Definitions
 *
 * Core interfaces used across all packages.
 */

// ─── Account Configuration ─────────────────────────────────

export interface AccountConfig {
  /** Short alias for this account (e.g., 'personal', 'work') */
  alias: string;
  /** Email address */
  email: string;
  /** Account type */
  type: 'personal' | 'workspace';
  /** Provider identifier (defaults to 'google' for backwards compatibility) */
  provider?: string;
  /** Whether user is admin of this workspace */
  isAdmin?: boolean;
  /** Project slugs this account is associated with */
  projects: string[];
  /** Use this account for email drafts by default */
  isDefaultDraft?: boolean;
  /** Use this account for tasks by default */
  isDefaultTasks?: boolean;
  /** Priority for Drive cleanup (lower = clean first) */
  driveCleanupPriority?: number;
  /** Fallback auth method if OAuth is blocked */
  fallbackAuth?: 'imap';
}

// ─── Vault Types ────────────────────────────────────────────

export interface VaultFile {
  path: string;
  content: string;
  sha?: string;
}

export interface VaultProject {
  slug: string;
  title: string;
  status: string;
  category?: string;
  path: string;
  /** Folder path for folder-based projects (e.g., 'Projects/Work/esp') */
  folderPath: string;
  /** Display name parsed from frontmatter or slug */
  name?: string;
}

/** User-customizable vault structure configuration */
export interface VaultStructureConfig {
  /** Project category folders under Areas/Projects/ (default: ['Work','Personal','Archive']) */
  projectCategories: string[];
  /** Subfolders to create within each project folder (default: ['files']) */
  projectSubfolders: string[];
  /** Recommended frontmatter tags for project notes */
  projectTags: string[];
}

export interface DailyNote {
  date: string;
  path: string;
  content: string;
}

// ─── Google API Types ───────────────────────────────────────

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  account: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  labels: string[];
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface CalendarEvent {
  id: string;
  account: string;
  calendarId: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: Attendee[];
  location?: string;
  status: string;
  htmlLink?: string;
}

export interface Attendee {
  email: string;
  displayName?: string;
  responseStatus?: string;
  self?: boolean;
}

export interface TaskItem {
  id: string;
  account: string;
  taskListId: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
  completed?: string;
  parent?: string;
}

export interface DriveFile {
  id: string;
  account: string;
  name: string;
  mimeType: string;
  size?: number;
  modifiedTime: string;
  parents?: string[];
  webViewLink?: string;
}

export interface Contact {
  name: string;
  email: string;
  source: 'contacts' | 'gmail' | 'vault' | 'granola' | 'calendar';
  account?: string;
  organization?: string;
  phone?: string;
}

// ─── Agent Types ────────────────────────────────────────────

export interface MeetingData {
  id: string;
  title: string;
  date: string;
  transcript: string;
  summary: string;
  attendees: string[];
  actionItems?: ActionItem[];
  /** Source of the meeting data (e.g., 'granola') */
  source?: string;
}

export interface ActionItem {
  title: string;
  assignee?: string;
  dueDate?: string;
  project?: string;
  priority?: 'high' | 'medium' | 'low';
}

export type ActionRisk = 'low' | 'high';

/** Action type identifier used for routing and safety classification */
export type ActionType = SuggestedActionType;

export interface SuggestedAction {
  /** Unique identifier */
  id: string;
  /** Action type for routing */
  type: SuggestedActionType;
  /** Risk classification */
  risk: ActionRisk;
  /** Human-readable description */
  description: string;
  /** Whether this action auto-executes without approval */
  autoExecute: boolean;
  /** Current status */
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  /** Arbitrary metadata for the action */
  metadata: Record<string, unknown>;
  /** When the action was created */
  createdAt: string;
  /** Source type (e.g., 'meeting', 'sync', 'briefing') */
  sourceType: string;
  /** ID of the source entity */
  sourceId: string;
}

export type SuggestedActionType =
  | 'create_task'
  | 'update_project_note'
  | 'save_transcript'
  | 'save_summary'
  | 'update_daily_note'
  | 'save_file_to_vault'
  | 'move_drive_file'
  | 'update_sync_log'
  | 'send_email'
  | 'create_draft_email'
  | 'create_calendar_invite'
  | 'create_project';

export interface SyncResult {
  account: string;
  service: string;
  itemsSynced: number;
  errors: string[];
  timestamp: string;
}

export interface SyncLog {
  lastSync: string;
  results: SyncResult[];
}

export interface AccountSyncStatus {
  alias: string;
  emails: number;
  events: number;
  tasks: number;
  files: number;
  errors: string[];
}

export interface FollowUpItem {
  subject: string;
  to: string;
  sentDate: string;
  account: string;
  threadId: string;
}

// ─── Research Types ─────────────────────────────────────────

export type ResearchType =
  | 'business_viability'
  | 'market_research'
  | 'competitive_analysis'
  | 'person_company'
  | 'technology';

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export interface ResearchRequest {
  /** Research query / topic */
  query: string;
  /** Type of research to conduct */
  type: ResearchType;
  /** Depth level (affects thoroughness and time) */
  depth: ResearchDepth;
  /** Optional additional context */
  context?: string;
}

export interface ResearchReport {
  title: string;
  type: ResearchType;
  date: string;
  summary: string;
  sections: ResearchSection[];
  sources: string[];
  verdict?: string;
}

export interface ResearchSection {
  heading: string;
  content: string;
}

// ─── Action Safety ──────────────────────────────────────────

/** Actions that execute automatically without approval */
export const AUTO_EXECUTE_ACTIONS: SuggestedActionType[] = [
  'create_task',
  'update_project_note',
  'save_transcript',
  'save_summary',
  'update_daily_note',
  'save_file_to_vault',
  'move_drive_file',
  'update_sync_log',
];

/** Actions that require user approval before execution */
export const QUEUE_ACTIONS: SuggestedActionType[] = [
  'send_email',
  'create_draft_email',
  'create_calendar_invite',
  'create_project',
];

export function isAutoExecute(action: SuggestedActionType): boolean {
  return AUTO_EXECUTE_ACTIONS.includes(action);
}

// ─── Constants ──────────────────────────────────────────────

/** Standard vault directory paths */
export const VAULT_PATHS = {
  projects: 'Areas/Projects',
  daily: 'Daily',
  files: 'Files',
  meetings: 'Files/Meetings',
  research: 'Files/Research',
  reports: 'Files/Reports',
  templates: 'Templates',
  areas: 'Areas',
  dashboard: 'Dashboard.md',
  syncLog: 'Daily/sync-log.md',
} as const;

/** Maximum file size for vault sync (10MB) */
export const MAX_SYNC_SIZE_BYTES = parseInt(
  process.env.VAULT_FILE_SIZE_LIMIT || '10485760',
  10
);

/**
 * Export format mapping for Google Workspace files.
 * Maps Google MIME types to export MIME types and file extensions.
 */
export const GOOGLE_DOCS_EXPORT: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': { mimeType: 'text/markdown', extension: '.md' },
  'application/vnd.google-apps.spreadsheet': { mimeType: 'text/csv', extension: '.csv' },
  'application/vnd.google-apps.presentation': { mimeType: 'application/pdf', extension: '.pdf' },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', extension: '.png' },
};
