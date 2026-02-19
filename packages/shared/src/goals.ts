/**
 * Goal tracking — parse and format quarterly goals from vault markdown
 *
 * Goal file format (Areas/Personal/goals.md):
 * ### Category Name
 * - [ ] Goal description
 *   - Target: 36 | Current: 12 | Unit: runs
 */

import type { Goal, KeyResult } from './types.js';

/**
 * Parse goals from markdown content.
 */
export function parseGoals(content: string): Goal[] {
  const goals: Goal[] = [];
  let currentCategory = '';

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Category header: ### Category Name
    const categoryMatch = line.match(/^###\s+(.+)/);
    if (categoryMatch) {
      currentCategory = categoryMatch[1].trim();
      continue;
    }

    // Goal line: - [ ] or - [x] description
    const goalMatch = line.match(/^-\s+\[([ x])\]\s+(.+)/);
    if (goalMatch) {
      const completed = goalMatch[1] === 'x';
      const title = goalMatch[2].trim();

      // Check next line for key result metadata
      let keyResult: KeyResult | undefined;
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const krMatch = nextLine.match(/^\s+-\s+Target:\s*(\d+)\s*\|\s*Current:\s*(\d+)\s*\|\s*Unit:\s*(.+)/i);
        if (krMatch) {
          keyResult = {
            target: parseInt(krMatch[1], 10),
            current: parseInt(krMatch[2], 10),
            unit: krMatch[3].trim(),
          };
        }
      }

      goals.push({
        title,
        category: currentCategory,
        completed,
        keyResult,
      });
    }
  }

  return goals;
}

/**
 * Format goals back to markdown.
 */
export function formatGoals(goals: Goal[]): string {
  const byCategory = new Map<string, Goal[]>();

  for (const goal of goals) {
    const cat = goal.category || 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(goal);
  }

  const sections: string[] = [];

  for (const [category, categoryGoals] of byCategory) {
    sections.push(`### ${category}`);
    for (const goal of categoryGoals) {
      const checkbox = goal.completed ? '[x]' : '[ ]';
      sections.push(`- ${checkbox} ${goal.title}`);
      if (goal.keyResult) {
        const kr = goal.keyResult;
        sections.push(`  - Target: ${kr.target} | Current: ${kr.current} | Unit: ${kr.unit}`);
      }
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Generate a text progress bar.
 */
function progressBar(current: number, target: number): string {
  const pct = Math.min(Math.round((current / target) * 100), 100);
  const filled = Math.round(pct / 10);
  const empty = 10 - filled;
  return `[${'#'.repeat(filled)}${'-'.repeat(empty)}] ${pct}%`;
}

/**
 * Format goals as a readable summary with progress bars.
 */
export function formatGoalsSummary(goals: Goal[]): string {
  if (goals.length === 0) return 'No goals found.';

  const byCategory = new Map<string, Goal[]>();
  for (const goal of goals) {
    const cat = goal.category || 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(goal);
  }

  const lines: string[] = [];
  for (const [category, categoryGoals] of byCategory) {
    lines.push(`<b>${category}</b>`);
    for (const goal of categoryGoals) {
      const status = goal.completed ? '(done)' : '';
      if (goal.keyResult) {
        const kr = goal.keyResult;
        const bar = progressBar(kr.current, kr.target);
        lines.push(`  ${goal.title} ${status}`);
        lines.push(`  ${bar} (${kr.current}/${kr.target} ${kr.unit})`);
      } else {
        const check = goal.completed ? 'x' : ' ';
        lines.push(`  [${check}] ${goal.title}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
