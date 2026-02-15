/**
 * LifeOS — Vault Reorganization CLI
 *
 * Ongoing vault structure maintenance: move projects, archive,
 * validate structure, add subfolders, change inbox style.
 *
 * Usage:
 *   npm run vault -- move-project <slug> <target-category>
 *   npm run vault -- archive-project <slug>
 *   npm run vault -- validate
 *   npm run vault -- add-subfolder <name>
 *   npm run vault -- change-inbox-style <by-contact|flat>
 *
 * All commands support --dry-run to preview changes without executing.
 */

import { Octokit } from '@octokit/rest';
import 'dotenv/config';

const DRY_RUN = process.argv.includes('--dry-run');
const [, , subcommand, ...args] = process.argv.filter(a => a !== '--dry-run');

const GITHUB_PAT = process.env.GITHUB_PAT!;
const REPO_OWNER = process.env.GITHUB_REPO_OWNER!;
const REPO_NAME = process.env.GITHUB_REPO_NAME!;
const BRANCH = process.env.GITHUB_BRANCH || 'main';

if (!GITHUB_PAT || !REPO_OWNER || !REPO_NAME) {
  console.error('Missing required env vars: GITHUB_PAT, GITHUB_REPO_OWNER, GITHUB_REPO_NAME');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_PAT });

const CATEGORIES = JSON.parse(process.env.VAULT_CATEGORIES || '["Consulting","SaaS","Business","Archive"]') as string[];
const SUBFOLDERS = JSON.parse(process.env.PROJECT_SUBFOLDERS || '["files"]') as string[];

// ─── Types ──────────────────────────────────────────────

interface TreeEntry {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  sha?: string | null;
  content?: string;
}

// ─── GitHub Helpers ─────────────────────────────────────

async function listDir(path: string): Promise<Array<{ name: string; type: 'file' | 'dir'; path: string }>> {
  try {
    const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH });
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
    const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH });
    if (Array.isArray(data) || data.type !== 'file') return null;
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

async function getFileSha(path: string): Promise<string | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner: REPO_OWNER, repo: REPO_NAME, path, ref: BRANCH });
    if (Array.isArray(data)) return null;
    return data.sha;
  } catch {
    return null;
  }
}

async function commitTree(entries: TreeEntry[], message: string): Promise<void> {
  const { data: ref } = await octokit.git.getRef({ owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${BRANCH}` });
  const baseCommitSha = ref.object.sha;

  const { data: baseCommit } = await octokit.git.getCommit({ owner: REPO_OWNER, repo: REPO_NAME, commit_sha: baseCommitSha });
  const baseTreeSha = baseCommit.tree.sha;

  // Create blobs for entries with content
  const processedEntries: TreeEntry[] = [];
  for (const entry of entries) {
    if (entry.content !== undefined && entry.sha === undefined) {
      const { data: blob } = await octokit.git.createBlob({
        owner: REPO_OWNER, repo: REPO_NAME,
        content: Buffer.from(entry.content).toString('base64'),
        encoding: 'base64',
      });
      processedEntries.push({ ...entry, sha: blob.sha, content: undefined });
    } else {
      processedEntries.push(entry);
    }
  }

  const { data: newTree } = await octokit.git.createTree({
    owner: REPO_OWNER, repo: REPO_NAME,
    base_tree: baseTreeSha,
    tree: processedEntries as any,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner: REPO_OWNER, repo: REPO_NAME,
    message,
    tree: newTree.sha,
    parents: [baseCommitSha],
  });

  await octokit.git.updateRef({ owner: REPO_OWNER, repo: REPO_NAME, ref: `heads/${BRANCH}`, sha: newCommit.sha });
  console.log(`  Commit: ${newCommit.sha.slice(0, 7)} — ${message}`);
}

// ─── Find Project ───────────────────────────────────────

async function findProject(slug: string): Promise<{ path: string; category: string } | null> {
  for (const category of CATEGORIES) {
    const entries = await listDir(`Projects/${category}`);
    if (entries.some(e => e.type === 'dir' && e.name === slug)) {
      return { path: `Projects/${category}/${slug}`, category };
    }
  }

  // Check root
  const rootEntries = await listDir('Projects');
  if (rootEntries.some(e => e.type === 'dir' && e.name === slug)) {
    return { path: `Projects/${slug}`, category: '' };
  }

  return null;
}

async function collectFiles(dirPath: string): Promise<Array<{ path: string; type: 'file' | 'dir' }>> {
  const results: Array<{ path: string; type: 'file' | 'dir' }> = [];
  const entries = await listDir(dirPath);

  for (const entry of entries) {
    results.push(entry);
    if (entry.type === 'dir') {
      const subEntries = await collectFiles(entry.path);
      results.push(...subEntries);
    }
  }

  return results;
}

// ─── Commands ───────────────────────────────────────────

async function moveProject(slug: string, targetCategory: string): Promise<void> {
  console.log(`\n  Moving project "${slug}" to ${targetCategory}...\n`);

  if (!CATEGORIES.includes(targetCategory)) {
    console.error(`  Unknown category "${targetCategory}". Available: ${CATEGORIES.join(', ')}`);
    process.exit(1);
  }

  const project = await findProject(slug);
  if (!project) {
    console.error(`  Project "${slug}" not found.`);
    process.exit(1);
  }

  if (project.category === targetCategory) {
    console.log(`  Project already in ${targetCategory}. Nothing to do.`);
    return;
  }

  const targetPath = `Projects/${targetCategory}/${slug}`;
  const files = await collectFiles(project.path);
  const treeEntries: TreeEntry[] = [];

  for (const file of files) {
    if (file.type !== 'file') continue;
    const relativePath = file.path.slice(project.path.length);
    const newPath = `${targetPath}${relativePath}`;

    const content = await readFileContent(file.path);
    if (content === null) continue;

    // Update frontmatter category if it's the README.md
    let finalContent = content;
    if (file.path.endsWith('/README.md')) {
      finalContent = content.replace(
        /^(category:\s*).+$/m,
        `$1${targetCategory}`
      );
    }

    console.log(`  ${file.path} -> ${newPath}`);
    treeEntries.push({ path: newPath, mode: '100644', type: 'blob', content: finalContent });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: null }); // delete old
  }

  if (treeEntries.length === 0) {
    console.log('  No files found to move.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n  Dry run: would move ${files.filter(f => f.type === 'file').length} files.`);
    return;
  }

  await commitTree(treeEntries, `lifeos: move ${slug} from ${project.category || 'root'} to ${targetCategory}`);
  console.log(`\n  Done!`);
}

async function archiveProject(slug: string): Promise<void> {
  await moveProject(slug, 'Archive');
}

async function validate(): Promise<void> {
  console.log(`\n  Validating vault structure...${DRY_RUN ? ' (dry run)' : ''}\n`);

  const issues: string[] = [];
  let projectCount = 0;

  for (const category of CATEGORIES) {
    const entries = await listDir(`Projects/${category}`);
    for (const entry of entries) {
      if (entry.type !== 'dir') {
        if (entry.name.endsWith('.md')) {
          issues.push(`Flat .md file found: ${entry.path} (should be folder-per-project)`);
        }
        continue;
      }

      projectCount++;
      const slug = entry.name;
      const folderPath = entry.path;

      // Check for README.md
      const readme = await getFileSha(`${folderPath}/README.md`);
      if (!readme) {
        issues.push(`Missing README.md: ${folderPath}/`);
      }

      // Check for meeting-notes.md
      const meetingNotes = await getFileSha(`${folderPath}/meeting-notes.md`);
      if (!meetingNotes) {
        issues.push(`Missing meeting-notes.md: ${folderPath}/`);
      }

      // Check for required subfolders
      for (const subfolder of SUBFOLDERS) {
        const subEntries = await listDir(`${folderPath}/${subfolder}`);
        if (subEntries.length === 0) {
          const gitkeep = await getFileSha(`${folderPath}/${subfolder}/.gitkeep`);
          if (!gitkeep) {
            issues.push(`Missing subfolder: ${folderPath}/${subfolder}/`);
          }
        }
      }

      // Check README frontmatter
      if (readme) {
        const content = await readFileContent(`${folderPath}/README.md`);
        if (content) {
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (!fmMatch) {
            issues.push(`Missing frontmatter: ${folderPath}/README.md`);
          } else {
            const fm = fmMatch[1];
            if (!fm.includes('status:')) issues.push(`Missing status in frontmatter: ${folderPath}/README.md`);
            if (!fm.includes('category:')) issues.push(`Missing category in frontmatter: ${folderPath}/README.md`);
          }
        }
      }
    }
  }

  // Check for orphaned project directories at root
  const rootEntries = await listDir('Projects');
  for (const entry of rootEntries) {
    if (entry.type === 'dir' && !CATEGORIES.includes(entry.name)) {
      issues.push(`Uncategorized project folder: ${entry.path}/ (not in any category)`);
    }
    if (entry.type === 'file' && entry.name.endsWith('.md')) {
      issues.push(`Flat .md file at root: ${entry.path} (should be folder-per-project)`);
    }
  }

  // Check system directories
  const requiredDirs = ['Daily', 'Files/Meetings', 'Files/Research', 'Files/Reports', 'Areas', 'Templates'];
  for (const dir of requiredDirs) {
    const entries = await listDir(dir);
    const gitkeep = await getFileSha(`${dir}/.gitkeep`);
    if (entries.length === 0 && !gitkeep) {
      issues.push(`Missing system directory: ${dir}/`);
    }
  }

  // Report
  console.log(`  Scanned ${projectCount} projects across ${CATEGORIES.length} categories.\n`);

  if (issues.length === 0) {
    console.log('  No issues found. Vault structure is healthy!\n');
  } else {
    console.log(`  Found ${issues.length} issue(s):\n`);
    for (const issue of issues) {
      console.log(`    - ${issue}`);
    }
    console.log('');
  }
}

async function addSubfolder(name: string): Promise<void> {
  console.log(`\n  Adding subfolder "${name}" to all projects...${DRY_RUN ? ' (dry run)' : ''}\n`);

  const treeEntries: TreeEntry[] = [];

  for (const category of CATEGORIES) {
    const entries = await listDir(`Projects/${category}`);
    for (const entry of entries) {
      if (entry.type !== 'dir') continue;

      const subfolderPath = `${entry.path}/${name}/.gitkeep`;
      const existing = await getFileSha(subfolderPath);
      if (existing) continue;

      // Check if subfolder has any files already
      const subEntries = await listDir(`${entry.path}/${name}`);
      if (subEntries.length > 0) continue;

      console.log(`  Creating ${entry.path}/${name}/`);
      treeEntries.push({ path: subfolderPath, mode: '100644', type: 'blob', content: '' });
    }
  }

  if (treeEntries.length === 0) {
    console.log('  All projects already have this subfolder.\n');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n  Dry run: would create ${treeEntries.length} .gitkeep files.\n`);
    return;
  }

  await commitTree(treeEntries, `lifeos: add ${name}/ subfolder to all projects`);
  console.log(`\n  Done!\n`);
}

async function changeInboxStyle(style: 'by-contact' | 'flat'): Promise<void> {
  console.log(`\n  Changing inbox style to "${style}"...${DRY_RUN ? ' (dry run)' : ''}\n`);

  const treeEntries: TreeEntry[] = [];
  const inboxEntries = await listDir('Inbox');

  if (style === 'flat') {
    // Flatten: move all files from contact subdirs to Inbox root
    for (const entry of inboxEntries) {
      if (entry.type !== 'dir') continue;

      const subDirs = await listDir(entry.path);
      for (const subDir of subDirs) {
        if (subDir.type !== 'dir') continue; // sent/ or received/
        const files = await listDir(subDir.path);
        for (const file of files) {
          if (file.type !== 'file') continue;
          const content = await readFileContent(file.path);
          if (content === null) continue;

          console.log(`  ${file.path} -> Inbox/${file.name}`);
          treeEntries.push({ path: `Inbox/${file.name}`, mode: '100644', type: 'blob', content });
          treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: null });
        }
      }
    }
  } else {
    // By-contact: move flat files into Inbox/unsorted/received/
    for (const entry of inboxEntries) {
      if (entry.type !== 'file') continue;
      const content = await readFileContent(entry.path);
      if (content === null) continue;

      console.log(`  ${entry.path} -> Inbox/unsorted/received/${entry.name}`);
      treeEntries.push({ path: `Inbox/unsorted/received/${entry.name}`, mode: '100644', type: 'blob', content });
      treeEntries.push({ path: entry.path, mode: '100644', type: 'blob', sha: null });
    }
  }

  if (treeEntries.length === 0) {
    console.log('  No files to move.\n');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n  Dry run: would move ${treeEntries.length / 2} files.\n`);
    return;
  }

  await commitTree(treeEntries, `lifeos: change inbox style to ${style}`);
  console.log(`\n  Done!\n`);
}

// ─── Main ───────────────────────────────────────────────

function showUsage(): void {
  console.log(`
  LifeOS Vault Reorganization

  Usage:
    npm run vault -- move-project <slug> <target-category>
    npm run vault -- archive-project <slug>
    npm run vault -- validate
    npm run vault -- add-subfolder <name>
    npm run vault -- change-inbox-style <by-contact|flat>

  Options:
    --dry-run    Preview changes without executing

  Categories: ${CATEGORIES.join(', ')}
`);
}

async function main() {
  switch (subcommand) {
    case 'move-project': {
      const [slug, targetCategory] = args;
      if (!slug || !targetCategory) {
        console.error('Usage: npm run vault -- move-project <slug> <target-category>');
        process.exit(1);
      }
      await moveProject(slug, targetCategory);
      break;
    }
    case 'archive-project': {
      const [slug] = args;
      if (!slug) {
        console.error('Usage: npm run vault -- archive-project <slug>');
        process.exit(1);
      }
      await archiveProject(slug);
      break;
    }
    case 'validate':
      await validate();
      break;
    case 'add-subfolder': {
      const [name] = args;
      if (!name) {
        console.error('Usage: npm run vault -- add-subfolder <name>');
        process.exit(1);
      }
      await addSubfolder(name);
      break;
    }
    case 'change-inbox-style': {
      const [style] = args;
      if (style !== 'by-contact' && style !== 'flat') {
        console.error('Usage: npm run vault -- change-inbox-style <by-contact|flat>');
        process.exit(1);
      }
      await changeInboxStyle(style);
      break;
    }
    default:
      showUsage();
      if (subcommand) {
        console.error(`Unknown command: ${subcommand}`);
        process.exit(1);
      }
  }
}

main().catch(error => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
