/**
 * LifeOS — Project Path Resolution
 *
 * Resolves vault paths for folder-per-project structure.
 * Reads config from environment with sensible PARA-inspired defaults.
 */

import { VaultStructureConfig, VAULT_PATHS } from './types.js';
import { listDirectory } from './vault.js';

// ─── Default Configuration ──────────────────────────────

const DEFAULT_CONFIG: VaultStructureConfig = {
  projectCategories: ['Consulting', 'Node Works', 'Ideas', 'Open Source', 'Archive'],
  projectSubfolders: ['files'],
  projectTags: [
    'status/active',
    'status/paused',
    'status/done',
    'type/client',
    'type/product',
    'type/personal',
  ],
};

/**
 * Read vault structure config from environment variables with defaults.
 */
export function getVaultConfig(): VaultStructureConfig {
  return {
    projectCategories: parseJsonEnv('VAULT_CATEGORIES', DEFAULT_CONFIG.projectCategories),
    projectSubfolders: parseJsonEnv('PROJECT_SUBFOLDERS', DEFAULT_CONFIG.projectSubfolders),
    projectTags: parseJsonEnv('PROJECT_TAGS', DEFAULT_CONFIG.projectTags),
  };
}

function parseJsonEnv<T>(key: string, fallback: T): T {
  const raw = process.env[key];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ─── Project Path Resolution ────────────────────────────

/** Cache for project slug → folder path mapping */
let _projectPathCache: Map<string, string> | null = null;

/**
 * Resolve a project slug to its folder path by scanning category directories.
 * Returns the folder path (e.g., 'Areas/Projects/Consulting/esp') or null if not found.
 */
export async function resolveProjectPath(slug: string): Promise<string | null> {
  const config = getVaultConfig();

  for (const category of config.projectCategories) {
    const categoryPath = `${VAULT_PATHS.projects}/${category}`;
    try {
      const entries = await listDirectory(categoryPath);
      const match = entries.find(e => e.type === 'dir' && e.name === slug);
      if (match) return match.path;
    } catch {
      // Category directory may not exist yet
    }
  }

  // Also check Projects/ root for uncategorized projects
  try {
    const entries = await listDirectory(VAULT_PATHS.projects);
    const match = entries.find(e => e.type === 'dir' && e.name === slug);
    if (match) return match.path;
  } catch {
    // Projects directory may not exist
  }

  return null;
}

/**
 * Cached version of resolveProjectPath for batch operations.
 * Builds the full cache on first call, then serves from memory.
 */
export async function resolveProjectPathCached(slug: string): Promise<string | null> {
  if (!_projectPathCache) {
    _projectPathCache = new Map();
    const config = getVaultConfig();

    for (const category of config.projectCategories) {
      const categoryPath = `${VAULT_PATHS.projects}/${category}`;
      try {
        const entries = await listDirectory(categoryPath);
        for (const entry of entries) {
          if (entry.type === 'dir') {
            _projectPathCache.set(entry.name, entry.path);
          }
        }
      } catch {
        // Category doesn't exist yet
      }
    }

    // Also scan Projects/ root
    try {
      const entries = await listDirectory(VAULT_PATHS.projects);
      for (const entry of entries) {
        if (entry.type === 'dir' && !_projectPathCache.has(entry.name)) {
          // Skip category folders themselves
          const config = getVaultConfig();
          if (!config.projectCategories.includes(entry.name)) {
            _projectPathCache.set(entry.name, entry.path);
          }
        }
      }
    } catch {
      // Projects directory may not exist
    }
  }

  return _projectPathCache.get(slug) ?? null;
}

/**
 * Clear the project path cache (call after creating/moving projects).
 */
export function clearProjectPathCache(): void {
  _projectPathCache = null;
}

// ─── File Path Builders ─────────────────────────────────

/**
 * Build the vault path for a file within a project.
 * Places files in the project's files/ subfolder.
 *
 * @param projectFolder - Project folder path (e.g., 'Areas/Projects/Consulting/esp')
 * @param filename - The filename to save
 * @returns Full vault path (e.g., 'Areas/Projects/Consulting/esp/files/document.md')
 */
export function buildProjectFilePath(projectFolder: string, filename: string): string {
  return `${projectFolder}/files/${filename}`;
}

/**
 * Build the vault path for an inbox file (email attachment, etc.).
 * Files are stored under Files/Inbox/ organized by contact and direction.
 *
 * @param contactName - Contact name slug (e.g., 'john-doe')
 * @param direction - Whether the file was sent or received
 * @param filename - The filename
 * @returns Full vault path (e.g., 'Files/Inbox/john-doe/received/doc.pdf')
 */
export function buildInboxFilePath(
  contactName: string,
  direction: 'sent' | 'received',
  filename: string
): string {
  const slug = contactName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${VAULT_PATHS.files}/Inbox/${slug}/${direction}/${filename}`;
}

/**
 * Build the path to a project's meeting-notes.md file.
 */
export function buildProjectMeetingNotesPath(projectFolder: string): string {
  return `${projectFolder}/meeting-notes.md`;
}

// ─── Email Helpers ──────────────────────────────────────

/**
 * Extract a contact name from an email address or header value.
 * e.g., "John Doe <john@example.com>" → "john-doe"
 *       "john@example.com" → "john"
 */
export function extractContactName(emailHeader: string): string {
  // Try to extract display name from "Name <email>" format
  const nameMatch = emailHeader.match(/^"?([^"<]+)"?\s*</);
  if (nameMatch) {
    return nameMatch[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  // Fall back to local part of email
  const emailMatch = emailHeader.match(/<?([^@<>\s]+)@/);
  if (emailMatch) {
    return emailMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  return 'unknown';
}

/**
 * Determine if an email is sent or received based on From header.
 *
 * @param fromHeader - The From header value
 * @param accountEmails - List of the user's own email addresses
 * @returns 'sent' if the user sent it, 'received' if someone else sent it
 */
export function getEmailDirection(
  fromHeader: string,
  accountEmails: string[]
): 'sent' | 'received' {
  const fromEmail = fromHeader.match(/<?([^@<>\s]+@[^@<>\s]+)>?/)?.[1]?.toLowerCase();
  if (fromEmail && accountEmails.some(e => e.toLowerCase() === fromEmail)) {
    return 'sent';
  }
  return 'received';
}

/**
 * Check if an email is likely a newsletter/automated message.
 * These should be skipped during attachment sync.
 */
export function isNewsletter(headers: Record<string, string>): boolean {
  const from = (headers['from'] || headers['From'] || '').toLowerCase();

  // Common automated sender patterns
  const automatedPatterns = [
    'noreply@',
    'no-reply@',
    'newsletter@',
    'notifications@',
    'donotreply@',
    'do-not-reply@',
    'mailer-daemon@',
    'postmaster@',
    'updates@',
    'info@',
  ];

  if (automatedPatterns.some(p => from.includes(p))) {
    return true;
  }

  // Check for List-Unsubscribe header (strong newsletter signal)
  if (headers['list-unsubscribe'] || headers['List-Unsubscribe']) {
    return true;
  }

  // Check Precedence header
  const precedence = (headers['precedence'] || headers['Precedence'] || '').toLowerCase();
  if (precedence === 'bulk' || precedence === 'list') {
    return true;
  }

  return false;
}
