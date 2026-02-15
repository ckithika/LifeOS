/**
 * LifeOS — Vault Access via GitHub API
 *
 * Provides read/write access to the Obsidian vault stored in a GitHub repository.
 * Uses the GitHub Contents API for file operations and the Search API for full-text search.
 *
 * The vault repo is private. Access is via a fine-grained GitHub PAT
 * scoped to the vault repo with Contents (read/write) permission.
 */

import { Octokit } from '@octokit/rest';
import { VaultFile, VaultProject, DailyNote } from './types.js';

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;

  const token = process.env.GITHUB_PAT;
  if (!token) {
    throw new Error('GITHUB_PAT environment variable is required for vault access.');
  }

  _octokit = new Octokit({ auth: token });
  return _octokit;
}

function getRepoInfo() {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!owner || !repo) {
    throw new Error(
      'GITHUB_REPO_OWNER and GITHUB_REPO_NAME are required. ' +
      'These should point to your private vault repository.'
    );
  }

  return { owner, repo, ref: branch };
}

// ─── Read Operations ────────────────────────────────────────

/**
 * Read a file from the vault.
 *
 * @param path - Relative path within the vault (e.g., 'Projects/my-project.md')
 * @returns File content and metadata, or null if not found
 */
export async function readFile(path: string): Promise<VaultFile | null> {
  const octokit = getOctokit();
  const { owner, repo, ref } = getRepoInfo();

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    const data = response.data;
    if (Array.isArray(data) || data.type !== 'file') {
      return null;
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { path, content, sha: data.sha };
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * List files in a vault directory.
 *
 * @param dirPath - Directory path (e.g., 'Projects/', 'Files/ESP/')
 * @returns Array of file/directory names with types
 */
export async function listDirectory(dirPath: string): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  const octokit = getOctokit();
  const { owner, repo, ref } = getRepoInfo();

  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path: dirPath,
      ref,
    });

    if (!Array.isArray(response.data)) {
      return [];
    }

    return response.data.map(item => ({
      name: item.name,
      type: item.type === 'dir' ? 'dir' as const : 'file' as const,
      path: item.path,
    }));
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Search for content across the vault using GitHub Code Search.
 *
 * @param query - Search query
 * @returns Matching files with content snippets
 */
export async function searchVault(query: string): Promise<Array<{ path: string; matches: string[] }>> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const response = await octokit.search.code({
    q: `${query} repo:${owner}/${repo}`,
    per_page: 20,
  });

  return response.data.items.map(item => ({
    path: item.path,
    matches: item.text_matches?.map(m => m.fragment || '') || [],
  }));
}

// ─── Write Operations ───────────────────────────────────────

/**
 * Create or update a file in the vault.
 *
 * @param path - File path within the vault
 * @param content - File content (UTF-8 string)
 * @param message - Commit message
 * @returns The new SHA of the file
 */
export async function writeFile(
  path: string,
  content: string,
  message?: string
): Promise<string> {
  const octokit = getOctokit();
  const { owner, repo, ref } = getRepoInfo();

  // Check if file exists to get its SHA (needed for updates)
  const existing = await readFile(path);

  const commitMessage = message || `lifeos: update ${path}`;

  const response = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: commitMessage,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    sha: existing?.sha,
    branch: ref,
  });

  return response.data.content?.sha || '';
}

/**
 * Append content to an existing file (or create if it doesn't exist).
 *
 * @param path - File path
 * @param contentToAppend - Content to append
 * @param message - Commit message
 */
export async function appendToFile(
  path: string,
  contentToAppend: string,
  message?: string
): Promise<string> {
  const existing = await readFile(path);
  const currentContent = existing?.content || '';
  const newContent = currentContent.endsWith('\n')
    ? currentContent + contentToAppend
    : currentContent + '\n' + contentToAppend;

  return writeFile(path, newContent, message || `lifeos: append to ${path}`);
}

/**
 * Delete a file from the vault.
 */
export async function deleteFile(path: string, message?: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo, ref } = getRepoInfo();

  const existing = await readFile(path);
  if (!existing?.sha) return;

  await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message: message || `lifeos: delete ${path}`,
    sha: existing.sha,
    branch: ref,
  });
}

// ─── Vault-Specific Helpers ─────────────────────────────────

/**
 * List all projects in the vault by reading the Projects/ directory.
 * Parses frontmatter to extract status and category.
 */
export async function listProjects(): Promise<VaultProject[]> {
  const files = await listDirectory('Projects');
  const projects: VaultProject[] = [];

  for (const file of files) {
    if (file.type !== 'file' || !file.name.endsWith('.md')) continue;

    const content = await readFile(file.path);
    if (!content) continue;

    // Parse frontmatter
    const frontmatter = parseFrontmatter(content.content);
    const slug = file.name.replace('.md', '');

    projects.push({
      slug,
      title: frontmatter.title || slug.replace(/-/g, ' '),
      status: frontmatter.status || 'unknown',
      category: frontmatter.category,
      path: file.path,
    });
  }

  return projects;
}

/**
 * Read today's daily note, or create one from template if it doesn't exist.
 */
export async function getDailyNote(date?: string): Promise<DailyNote> {
  const today = date || new Date().toISOString().split('T')[0];
  const path = `Daily/${today}.md`;

  const existing = await readFile(path);

  if (existing) {
    return { date: today, path, content: existing.content };
  }

  // Create from template
  const template = `---
date: ${today}
---

# ${today}

## Calendar

## Tasks

## Emails

## Meeting Notes

## Suggested Actions

## Notes

`;

  await writeFile(path, template, `lifeos: create daily note ${today}`);
  return { date: today, path, content: template };
}

/**
 * Create a new project from template.
 */
export async function createProject(
  slug: string,
  title: string,
  category?: string
): Promise<VaultProject> {
  const path = `Projects/${slug}.md`;

  // Check if already exists
  const existing = await readFile(path);
  if (existing) {
    throw new Error(`Project "${slug}" already exists at ${path}`);
  }

  const content = `---
status: active
created: ${new Date().toISOString().split('T')[0]}
category: ${category || 'project'}
---

# ${title}

## Overview

## Key Contacts

## Notes

## Tasks

## Links

`;

  await writeFile(path, content, `lifeos: create project ${slug}`);

  // Create Files directory for the project
  const filesReadme = `# ${title} — Files\n\nSynced files for this project.\n`;
  await writeFile(`Files/${title}/README.md`, filesReadme, `lifeos: create files dir for ${slug}`);

  return {
    slug,
    title,
    status: 'active',
    category,
    path,
  };
}

// ─── Utilities ──────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns key-value pairs from the --- delimited block.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: Record<string, string> = {};
  const lines = match[1].split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    frontmatter[key] = value;
  }

  return frontmatter;
}

/**
 * Get the file size limit for vault sync (in bytes).
 * Files larger than this should be linked, not synced.
 */
export function getFileSizeLimit(): number {
  // 10MB default, configurable
  return parseInt(process.env.VAULT_FILE_SIZE_LIMIT || '10485760', 10);
}

/**
 * Read a daily note by date string (YYYY-MM-DD).
 * Returns the content string or null if it doesn't exist.
 */
export async function readDailyNote(date: string): Promise<string | null> {
  const path = `Daily/${date}.md`;
  const file = await readFile(path);
  return file?.content ?? null;
}

/**
 * Write (or overwrite) a daily note.
 *
 * @param content - Full markdown content
 * @param date - Date string (YYYY-MM-DD). Defaults to today.
 */
export async function writeDailyNote(content: string, date?: string): Promise<string> {
  const today = date || new Date().toISOString().split('T')[0];
  const path = `Daily/${today}.md`;
  return writeFile(path, content, `lifeos: write daily note ${today}`);
}

/**
 * Read the Dashboard.md file from the vault root.
 */
export async function readDashboard(): Promise<string | null> {
  const file = await readFile('Dashboard.md');
  return file?.content ?? null;
}
