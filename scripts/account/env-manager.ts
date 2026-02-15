/**
 * LifeOS — .env File Manager
 *
 * Read/write operations for .env file, specifically managing
 * ACCOUNTS_CONFIG and provider token entries.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import type { AccountConfig } from '../../packages/shared/src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(__dirname, '../../.env');

/**
 * Read the raw .env file content.
 */
export function readEnvFile(): string {
  try {
    return readFileSync(ENV_PATH, 'utf-8');
  } catch {
    throw new Error(`.env file not found at ${ENV_PATH}. Run: cp .env.example .env`);
  }
}

/**
 * Write the .env file content.
 */
export function writeEnvFile(content: string): void {
  writeFileSync(ENV_PATH, content);
}

/**
 * Set or update a key=value pair in .env.
 */
export function setEnvVar(key: string, value: string): void {
  let content = readEnvFile();
  const line = `${key}='${value}'`;
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.trimEnd() + `\n${line}\n`;
  }

  writeEnvFile(content);
}

/**
 * Remove a key from .env.
 */
export function removeEnvVar(key: string): void {
  let content = readEnvFile();
  const regex = new RegExp(`^${key}=.*\n?`, 'gm');
  content = content.replace(regex, '');
  writeEnvFile(content);
}

/**
 * Parse ACCOUNTS_CONFIG from .env and return the array.
 */
export function loadAccountsConfig(): AccountConfig[] {
  const content = readEnvFile();
  const match = content.match(/^ACCOUNTS_CONFIG='(.+)'$/m)
    || content.match(/^ACCOUNTS_CONFIG="(.+)"$/m)
    || content.match(/^ACCOUNTS_CONFIG=(.+)$/m);

  if (!match) return [];

  try {
    return JSON.parse(match[1]) as AccountConfig[];
  } catch {
    console.warn('Warning: ACCOUNTS_CONFIG is not valid JSON. Starting fresh.');
    return [];
  }
}

/**
 * Write ACCOUNTS_CONFIG back to .env.
 */
export function saveAccountsConfig(accounts: AccountConfig[]): void {
  const json = JSON.stringify(accounts);
  setEnvVar('ACCOUNTS_CONFIG', json);
}

/**
 * Add an account to ACCOUNTS_CONFIG. Replaces if alias already exists.
 */
export function addAccount(account: AccountConfig): void {
  const accounts = loadAccountsConfig();
  const existing = accounts.findIndex(a => a.alias === account.alias);

  if (existing !== -1) {
    accounts[existing] = account;
  } else {
    accounts.push(account);
  }

  saveAccountsConfig(accounts);
}

/**
 * Remove an account from ACCOUNTS_CONFIG by alias.
 * Also removes the provider token env var.
 */
export function removeAccount(alias: string, tokenEnvKey: string): void {
  const accounts = loadAccountsConfig().filter(a => a.alias !== alias);
  saveAccountsConfig(accounts);
  removeEnvVar(tokenEnvKey);
}
