/**
 * LifeOS — Configuration
 *
 * Loads account configuration and provides routing logic for
 * calendars, email drafts, and tasks across multiple Google accounts.
 *
 * Account config is loaded from the ACCOUNTS_CONFIG environment variable
 * as a JSON array. See .env.example for the format.
 */

import { AccountConfig } from './types.js';

/**
 * LifeOS configuration object returned by loadConfig().
 * Wraps the account array with convenience properties.
 */
export interface LifeOSConfig {
  accounts: AccountConfig[];
  defaultAccount: string;
}

let _accounts: AccountConfig[] | null = null;
let _calendarRouting: Record<string, string> = {};
let _draftRouting: Record<string, string> = {};

/**
 * Load and parse account configuration from environment.
 */
export function loadAccounts(): AccountConfig[] {
  if (_accounts) return _accounts;

  const raw = process.env.ACCOUNTS_CONFIG;
  if (!raw) {
    throw new Error(
      'ACCOUNTS_CONFIG environment variable is required. ' +
      'See .env.example for the expected format.'
    );
  }

  try {
    _accounts = JSON.parse(raw) as AccountConfig[];
  } catch {
    throw new Error('ACCOUNTS_CONFIG is not valid JSON. Check your .env file.');
  }

  if (!Array.isArray(_accounts) || _accounts.length === 0) {
    throw new Error('ACCOUNTS_CONFIG must be a non-empty JSON array.');
  }

  // Build routing tables
  for (const account of _accounts) {
    for (const project of account.projects) {
      // Calendar: route to the account that owns the project
      _calendarRouting[project] = account.alias;

      // Drafts: only if explicitly marked or if it's the default
      if (account.isDefaultDraft) {
        // Default draft account catches everything not explicitly routed
      }
    }

    // If account has draftAccount flag or isDefaultDraft, use for draft routing
    if (account.isDefaultDraft) {
      _draftRouting['default'] = account.alias;
    }
  }

  return _accounts;
}

/**
 * Get all configured accounts.
 */
export function getAccounts(): AccountConfig[] {
  return loadAccounts();
}

/**
 * Find an account by alias.
 */
export function getAccount(alias: string): AccountConfig | undefined {
  return loadAccounts().find(a => a.alias === alias);
}

/**
 * Find an account by email address.
 */
export function getAccountByEmail(email: string): AccountConfig | undefined {
  return loadAccounts().find(a => a.email === email);
}

/**
 * Get the default account for tasks.
 */
export function getDefaultTasksAccount(): AccountConfig {
  const accounts = loadAccounts();
  const defaultAccount = accounts.find(a => a.isDefaultTasks);
  if (!defaultAccount) {
    // Fall back to first account
    return accounts[0];
  }
  return defaultAccount;
}

/**
 * Get the default account for email drafts.
 */
export function getDefaultDraftAccount(): AccountConfig {
  const accounts = loadAccounts();
  const defaultAccount = accounts.find(a => a.isDefaultDraft);
  if (!defaultAccount) {
    return accounts[0];
  }
  return defaultAccount;
}

/**
 * Determine which account should handle a calendar invite for a given project.
 *
 * @param project - Project slug (e.g., 'esp', 'vivo')
 * @returns The account alias to use for calendar operations
 */
export function getCalendarAccount(project: string): string {
  loadAccounts();

  // Direct project mapping
  if (_calendarRouting[project]) {
    return _calendarRouting[project];
  }

  // Wildcard project match (account handles all projects)
  const wildcardAccount = loadAccounts().find(a => a.projects.includes('*'));
  if (wildcardAccount) {
    return wildcardAccount.alias;
  }

  // Fall back to default draft account (usually the personal account)
  return getDefaultDraftAccount().alias;
}

/**
 * Determine which account should be used for an email draft.
 *
 * @param project - Optional project slug for context-based routing
 * @returns The account alias to use for the draft
 */
export function getDraftAccount(project?: string): string {
  loadAccounts();

  // Check explicit draft routing for this project
  if (project && _draftRouting[project]) {
    return _draftRouting[project];
  }

  // Check if the project's account has specific draft routing
  if (project) {
    const account = loadAccounts().find(a => a.projects.includes(project));
    // Some accounts should draft from themselves (e.g., workspace accounts for their projects)
    if (account && account.type === 'workspace' && !account.projects.includes('*')) {
      return account.alias;
    }
  }

  // Default draft account
  return _draftRouting['default'] || loadAccounts()[0].alias;
}

/**
 * Get all project slugs across all accounts.
 */
export function getAllProjects(): string[] {
  const projects = new Set<string>();
  for (const account of loadAccounts()) {
    for (const project of account.projects) {
      if (project !== '*') {
        projects.add(project);
      }
    }
  }
  return Array.from(projects);
}

/**
 * Find which account(s) are associated with a project.
 */
export function getProjectAccounts(project: string): AccountConfig[] {
  return loadAccounts().filter(
    a => a.projects.includes(project) || a.projects.includes('*')
  );
}

/**
 * Get the environment variable for a specific account's Google token.
 */
export function getTokenEnvKey(alias: string): string {
  return `GOOGLE_TOKEN_${alias.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
}

/**
 * Load full configuration object.
 * Convenience wrapper around loadAccounts() that also returns the default account alias.
 */
export function loadConfig(): LifeOSConfig {
  const accounts = loadAccounts();
  const defaultAccount = getDefaultDraftAccount().alias;
  return { accounts, defaultAccount };
}

/**
 * Detect which project a meeting belongs to based on attendees and title.
 * Checks whether attendees or title keywords match any configured project.
 *
 * @param config - LifeOS configuration
 * @param attendees - Meeting attendee emails
 * @param title - Meeting title
 * @returns Project slug or null if no match
 */
export function detectProject(
  config: LifeOSConfig,
  attendees?: string[],
  title?: string
): string | null {
  const allProjectSlugs = getAllProjects();

  // Check title for project slug keywords
  if (title) {
    const titleLower = title.toLowerCase();
    for (const slug of allProjectSlugs) {
      if (titleLower.includes(slug.toLowerCase())) {
        return slug;
      }
    }
  }

  // Check attendee domains against account associations
  if (attendees && attendees.length > 0) {
    for (const attendee of attendees) {
      const domain = attendee.split('@')[1];
      if (!domain) continue;

      for (const account of config.accounts) {
        const accountDomain = account.email.split('@')[1];
        if (accountDomain === domain && account.projects.length > 0) {
          const firstProject = account.projects.find(p => p !== '*');
          if (firstProject) return firstProject;
        }
      }
    }
  }

  return null;
}

/**
 * Resolve which account to use for a given purpose (draft, calendar, tasks).
 *
 * @param config - LifeOS configuration
 * @param project - Project slug for context-based routing
 * @param purpose - What the account is being used for
 * @returns The account to use
 */
export function resolveAccount(
  config: LifeOSConfig,
  project: string,
  purpose: 'draft' | 'calendar' | 'tasks'
): AccountConfig {
  const accounts = config.accounts;

  switch (purpose) {
    case 'draft': {
      const alias = getDraftAccount(project);
      return accounts.find(a => a.alias === alias) || accounts[0];
    }
    case 'calendar': {
      const alias = getCalendarAccount(project);
      return accounts.find(a => a.alias === alias) || accounts[0];
    }
    case 'tasks': {
      return getDefaultTasksAccount();
    }
    default:
      return accounts[0];
  }
}
