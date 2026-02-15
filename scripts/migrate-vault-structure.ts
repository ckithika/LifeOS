/**
 * LifeOS — Vault Structure Migration
 *
 * One-time migration from flat .md files to folder-per-project structure.
 * Uses the GitHub Git Trees API for batch operations in a single commit.
 *
 * Usage: npx tsx scripts/migrate-vault-structure.ts [--dry-run]
 *
 * What it does:
 * 1. Converts project .md files → folders with README.md
 * 2. Extracts "Meeting Notes" sections into meeting-notes.md
 * 3. Creates configured subfolders with .gitkeep
 * 4. Moves Files/{project}/* into project folders
 * 5. Moves Files/Inbox/* → Inbox/{contact}/received/
 * 6. Cleans up empty directories
 */

import { Octokit } from '@octokit/rest';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Config ─────────────────────────────────────────────

const GITHUB_PAT = process.env.GITHUB_PAT!;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER!;
const REPO_NAME = process.env.GITHUB_REPO_NAME!;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

// Category assignment for known projects
// Your vault already has category folders — this maps loose .md files to categories
const PROJECT_CATEGORIES: Record<string, string> = {
  // Consulting projects
  'esp': 'Consulting',
  'vivo': 'Consulting',
  'lugnut': 'Consulting',
  'tuteria': 'Consulting',
  'adplist-mentoring': 'Consulting',
  // SaaS projects
  'boardroom': 'SaaS',
  'tailhq': 'SaaS',
  'koi': 'SaaS',
  'pepeair': 'SaaS',
  // Business
  'registered-company': 'Business',
  // Archive
  'buffalo-bicycles': 'Archive',
  // Root-level (currently uncategorized)
  'african-narrative-game': 'SaaS',
  'lifeos-infrastructure': 'SaaS',
};
const DEFAULT_CATEGORY = 'Consulting';

// Projects known to have large "Meeting Notes" sections worth extracting
const LARGE_PROJECTS: string[] = ['esp', 'vivo', 'lugnut', 'tuteria', 'boardroom', 'tailhq'];

// Map Files/ directory names to project slugs (when they differ)
const FILES_DIR_TO_SLUG: Record<string, string> = {
  'ESP': 'esp',
  'Vivo': 'vivo',
  'Lugnut': 'lugnut',
  'Tuteria': 'tuteria',
  'African Narrative Adventure Game': 'african-narrative-game',
};

const SUBFOLDERS = JSON.parse(process.env.PROJECT_SUBFOLDERS || '["files"]') as string[];

if (!GITHUB_PAT || !REPO_OWNER || !REPO_NAME) {
  console.error('Missing required env vars: GITHUB_PAT, GITHUB_REPO_OWNER, GITHUB_REPO_NAME');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_PAT });

// ─── Types ──────────────────────────────────────────────

interface TreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string | null;
  content?: string;
}

interface MigrationPlan {
  moves: Array<{ from: string; to: string; content?: string }>;
  creates: Array<{ path: string; content: string }>;
  deletes: string[];
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 LifeOS Vault Migration${DRY_RUN ? ' (DRY RUN)' : ''}\n`);
  console.log(`  Repo: ${REPO_OWNER}/${REPO_NAME}`);
  console.log(`  Branch: ${BRANCH}\n`);

  const plan = await buildMigrationPlan();

  console.log(`\n📋 Migration Plan:`);
  console.log(`  Moves:   ${plan.moves.length}`);
  console.log(`  Creates: ${plan.creates.length}`);
  console.log(`  Deletes: ${plan.deletes.length}\n`);

  if (plan.moves.length === 0 && plan.creates.length === 0 && plan.deletes.length === 0) {
    console.log('✅ Nothing to migrate — vault already uses folder structure.');
    return;
  }

  // Show details
  for (const move of plan.moves) {
    console.log(`  📦 ${move.from} → ${move.to}`);
  }
  for (const create of plan.creates) {
    console.log(`  ✨ ${create.path}`);
  }
  for (const del of plan.deletes) {
    console.log(`  🗑  ${del}`);
  }

  if (DRY_RUN) {
    console.log('\n🏁 Dry run complete. No changes made.');
    return;
  }

  await executeMigration(plan);
  console.log('\n✅ Migration complete!');
}

// ─── Build Plan ─────────────────────────────────────────

async function buildMigrationPlan(): Promise<MigrationPlan> {
  const plan: MigrationPlan = { moves: [], creates: [], deletes: [] };

  // Step 1: Find flat project .md files in Projects/ and its category subdirs
  console.log('Scanning Projects/ for flat .md files...');
  const projectRootEntries = await listDir('Projects');

  // Collect all .md files — both at Projects/ root and inside category subdirs
  const mdFiles: Array<{ path: string; name: string; category: string }> = [];

  for (const entry of projectRootEntries) {
    if (entry.type === 'file' && entry.name.endsWith('.md')) {
      // Flat file at Projects/ root (e.g., Projects/african-narrative-game.md)
      const slug = entry.name.replace('.md', '');
      mdFiles.push({ path: entry.path, name: entry.name, category: PROJECT_CATEGORIES[slug] || DEFAULT_CATEGORY });
    } else if (entry.type === 'dir') {
      // Category subdirectory (e.g., Projects/Consulting/)
      const categoryEntries = await listDir(entry.path);
      for (const sub of categoryEntries) {
        if (sub.type === 'file' && sub.name.endsWith('.md')) {
          // Flat .md inside a category dir (e.g., Projects/Consulting/esp.md)
          mdFiles.push({ path: sub.path, name: sub.name, category: entry.name });
        }
        // Skip directories — they might already be folder-per-project
      }
    }
  }

  console.log(`Found ${mdFiles.length} flat .md project files to migrate.`);

  for (const { path: filePath, name: fileName, category } of mdFiles) {
    const slug = fileName.replace('.md', '');
    const folderPath = `Projects/${category}/${slug}`;
    const readmePath = `${folderPath}/README.md`;

    // Read the project file content
    const content = await readFileContent(filePath);
    if (!content) continue;

    let readmeContent = content;
    let meetingNotesContent: string | null = null;

    // Extract meeting notes section if this is a large project
    if (LARGE_PROJECTS.includes(slug)) {
      const extracted = extractMeetingNotes(content, slug);
      readmeContent = extracted.mainContent;
      meetingNotesContent = extracted.meetingNotes;
    }

    // Move project .md → folder/README.md
    plan.moves.push({ from: filePath, to: readmePath, content: readmeContent });
    plan.deletes.push(filePath);

    // Create meeting-notes.md
    if (meetingNotesContent) {
      plan.creates.push({
        path: `${folderPath}/meeting-notes.md`,
        content: meetingNotesContent,
      });
    } else {
      plan.creates.push({
        path: `${folderPath}/meeting-notes.md`,
        content: `---\ntitle: "${slug} — Meeting Notes"\nproject: ${slug}\n---\n\n# ${slug} — Meeting Notes\n\n`,
      });
    }

    // Create subfolders with .gitkeep
    for (const subfolder of SUBFOLDERS) {
      plan.creates.push({
        path: `${folderPath}/${subfolder}/.gitkeep`,
        content: '',
      });
    }
  }

  // Step 2: Move Files/{project}/* into project folders
  console.log('Scanning Files/ for project directories...');
  const filesEntries = await listDir('Files');

  for (const entry of filesEntries) {
    if (entry.type === 'file') {
      // Handle loose files like lifeos-competitive-analysis.md
      if (entry.name === 'lifeos-competitive-analysis.md') {
        plan.moves.push({
          from: entry.path,
          to: 'Projects/SaaS/lifeos-infrastructure/files/lifeos-competitive-analysis.md',
        });
        plan.deletes.push(entry.path);
      }
      continue;
    }

    if (entry.type !== 'dir') continue;
    // Skip system directories
    if (['Meetings', 'Research', 'Reports', 'Inbox'].includes(entry.name)) continue;

    // Use the mapping or slugify the directory name
    const slug = FILES_DIR_TO_SLUG[entry.name]
      || entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const category = PROJECT_CATEGORIES[slug] || DEFAULT_CATEGORY;
    const projectFolder = `Projects/${category}/${slug}`;

    // List files in this directory
    const files = await listDir(entry.path);
    for (const file of files) {
      if (file.type === 'file') {
        plan.moves.push({
          from: file.path,
          to: `${projectFolder}/files/${file.name}`,
        });
        plan.deletes.push(file.path);
      }
    }
  }

  // Step 3: Move Files/Inbox/* → Inbox/{contact}/received/
  console.log('Scanning Files/Inbox/ for inbox files...');
  try {
    const inboxFiles = await listDir('Files/Inbox');
    for (const file of inboxFiles) {
      if (file.type !== 'file') continue;
      // Default to "unknown" contact — user can reorganize later
      plan.moves.push({
        from: file.path,
        to: `Inbox/unsorted/received/${file.name}`,
      });
      plan.deletes.push(file.path);
    }
  } catch {
    // Files/Inbox may not exist
  }

  // Step 4: Create system directories
  for (const dir of ['Files/Research', 'Files/Reports']) {
    plan.creates.push({ path: `${dir}/.gitkeep`, content: '' });
  }

  // Create Inbox directory structure
  plan.creates.push({ path: 'Inbox/.gitkeep', content: '' });

  return plan;
}

// ─── Execute Migration ──────────────────────────────────

async function executeMigration(plan: MigrationPlan): Promise<void> {
  console.log('\n🚀 Executing migration...');

  // Get the current commit SHA
  const { data: ref } = await octokit.git.getRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `heads/${BRANCH}`,
  });
  const baseCommitSha = ref.object.sha;

  // Get the base tree
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    commit_sha: baseCommitSha,
  });
  const baseTreeSha = baseCommit.tree.sha;

  // Build new tree entries
  const treeEntries: TreeEntry[] = [];

  // Add moved files (new location with content)
  for (const move of plan.moves) {
    const content = move.content || await readFileContent(move.from);
    if (content === null) continue;

    // Create blob for the content
    const { data: blob } = await octokit.git.createBlob({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    });

    treeEntries.push({
      path: move.to,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  // Add new files
  for (const create of plan.creates) {
    const { data: blob } = await octokit.git.createBlob({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      content: Buffer.from(create.content).toString('base64'),
      encoding: 'base64',
    });

    treeEntries.push({
      path: create.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  // Delete old files (set sha to null)
  for (const del of plan.deletes) {
    treeEntries.push({
      path: del,
      mode: '100644',
      type: 'blob',
      sha: null,
    });
  }

  // Create the new tree
  console.log(`Creating tree with ${treeEntries.length} entries...`);
  const { data: newTree } = await octokit.git.createTree({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    base_tree: baseTreeSha,
    tree: treeEntries as any,
  });

  // Create the commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    message: 'lifeos: migrate to folder-per-project vault structure\n\nConverted flat project .md files to folder structure with README.md,\nmeeting-notes.md, and configured subfolders. Moved project files\nfrom Files/ into project folders. Reorganized inbox.',
    tree: newTree.sha,
    parents: [baseCommitSha],
  });

  // Update the branch reference
  await octokit.git.updateRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `heads/${BRANCH}`,
    sha: newCommit.sha,
  });

  console.log(`Commit: ${newCommit.sha.slice(0, 7)} — ${newCommit.message.split('\n')[0]}`);
}

// ─── Helpers ────────────────────────────────────────────

async function listDir(path: string): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH,
    });

    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      name: item.name,
      type: item.type === 'dir' ? 'dir' as const : 'file' as const,
      path: item.path,
    }));
  } catch {
    return [];
  }
}

async function readFileContent(path: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: BRANCH,
    });

    if (Array.isArray(data) || data.type !== 'file') return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

function extractMeetingNotes(
  content: string,
  slug: string
): { mainContent: string; meetingNotes: string | null } {
  // Look for "## Meeting Notes" or "## Meetings" section
  const meetingHeaderPattern = /\n(## (?:Meeting Notes|Meetings))\n/i;
  const match = content.match(meetingHeaderPattern);

  if (!match || match.index === undefined) {
    return { mainContent: content, meetingNotes: null };
  }

  const sectionStart = match.index;
  const headerEnd = sectionStart + match[0].length;

  // Find the next ## header or end of file
  const nextSection = content.indexOf('\n## ', headerEnd);
  const sectionEnd = nextSection !== -1 ? nextSection : content.length;

  const meetingContent = content.slice(headerEnd, sectionEnd).trim();

  if (!meetingContent) {
    return { mainContent: content, meetingNotes: null };
  }

  // Build meeting-notes.md
  const meetingNotes = `---
title: "${slug} — Meeting Notes"
project: ${slug}
---

# ${slug} — Meeting Notes

${meetingContent}
`;

  // Remove the meeting notes section from main content,
  // replace with a link to meeting-notes.md
  const mainContent =
    content.slice(0, sectionStart) +
    '\n## Meeting Notes\n\nSee [meeting-notes.md](meeting-notes.md)\n' +
    content.slice(sectionEnd);

  return { mainContent, meetingNotes };
}

// ─── Run ────────────────────────────────────────────────

main().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
