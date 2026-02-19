/**
 * @lifeos/shared — Core utilities for LifeOS
 *
 * Provides Google multi-account auth, vault access via GitHub,
 * contact lookup, and configuration management.
 */

// Types
export * from './types.js';

// Configuration
export {
  loadAccounts,
  getAccounts,
  getAccount,
  getAccountByEmail,
  getDefaultTasksAccount,
  getDefaultDraftAccount,
  getCalendarAccount,
  getDraftAccount,
  getAllProjects,
  getProjectAccounts,
  getTokenEnvKey,
  loadConfig,
  detectProject,
  resolveAccount,
} from './config.js';

export type { LifeOSConfig } from './config.js';

// Google Auth
export {
  GOOGLE_SCOPES,
  getAuthClient,
  getGoogleClients,
  getAllGoogleClients,
  getAllAccountClients,
  getAuthUrl,
  exchangeCode,
  verifyTokens,
  clearAuthCache,
} from './google-auth.js';

// Vault (GitHub)
export {
  readFile,
  writeFile,
  appendToFile,
  deleteFile,
  listDirectory,
  searchVault,
  listProjects,
  getDailyNote,
  createProject,
  parseFrontmatter,
  getFileSizeLimit,
  readDailyNote,
  writeDailyNote,
  readDashboard,
} from './vault.js';

// Project Paths
export {
  getVaultConfig,
  resolveProjectPath,
  resolveProjectPathCached,
  clearProjectPathCache,
  buildProjectFilePath,
  buildInboxFilePath,
  buildProjectMeetingNotesPath,
  extractContactName,
  getEmailDirection,
  isNewsletter,
} from './project-paths.js';

// Goals
export {
  parseGoals,
  formatGoals,
  formatGoalsSummary,
} from './goals.js';

// Contacts
export {
  findContact,
  findEmail,
} from './contacts.js';

// Telegram
export {
  sendTelegramMessage,
  sendTelegramDocument,
} from './telegram.js';

