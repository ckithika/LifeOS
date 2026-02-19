/**
 * LifeOS Agent: Deep Research
 *
 * On-demand research agent that produces structured reports:
 * - Business viability assessment (TAM/SAM/SOM, competitive, financial)
 * - Market/industry research
 * - Competitive analysis
 * - Person/company background
 * - Technology evaluation
 *
 * Uses Claude with web_search tool for real-time research.
 * Results saved to vault as structured Markdown reports.
 *
 * Trigger: POST /research (called by MCP server or manually)
 */

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import 'dotenv/config';

import { writeFile, isVaultConfigured } from '@lifeos/shared';
import type { ResearchRequest, ResearchReport } from '@lifeos/shared';

const app = express();
app.use(express.json());

const anthropic = new Anthropic();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'lifeos-agent-research' });
});

// ─── Research Endpoint ───────────────────────────────────

app.post('/research', async (req, res) => {
  const request = req.body as ResearchRequest;

  if (!request.query || !request.type) {
    res.status(400).json({ error: 'Missing required fields: query, type' });
    return;
  }

  request.depth = request.depth ?? 'standard';
  console.log(`[research] Starting ${request.depth} ${request.type}: "${request.query}"`);

  try {
    const report = await conductResearch(request);

    // Save report to vault
    const slug = request.query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    const date = new Date().toISOString().split('T')[0];
    const reportPath = `Files/Research/${date}-${request.type}-${slug}.md`;

    if (isVaultConfigured()) {
      await writeFile(reportPath, formatReport(report), `Research: ${request.query}`);
      console.log(`[research] Report saved to ${reportPath}`);
    } else {
      console.log(`[research] Vault not configured — skipping report write`);
    }

    res.json({
      status: 'ok',
      report: {
        title: report.title,
        path: reportPath,
        sections: report.sections.length,
        verdict: report.verdict,
      },
    });
  } catch (error: any) {
    console.error('[research] Research failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Research Engine ─────────────────────────────────────

async function conductResearch(request: ResearchRequest): Promise<ResearchReport> {
  const systemPrompts: Record<string, string> = {
    business_viability: `You are a business analyst conducting a viability assessment. Research the given business idea thoroughly using web search. Structure your report with these sections:
1. Executive Summary (2-3 sentences)
2. Market Size (TAM/SAM/SOM with data sources)
3. Competitive Landscape (key players, market share, positioning)
4. Customer Analysis (target segments, pain points, willingness to pay)
5. Technical Feasibility (key challenges, technology stack requirements)
6. Business Model (revenue streams, pricing strategy, unit economics)
7. Go-to-Market Strategy (channels, partnerships, first customers)
8. Financial Projections (year 1-3 estimates with assumptions)
9. Risk Assessment (top 5 risks with mitigation strategies)
10. Comparable Companies (similar businesses, their trajectories)
11. Verdict: GO / NO-GO / CONDITIONAL with clear reasoning

Use real data and cite sources. Be honest about unknowns.`,

    market_research: `You are a market research analyst. Research the given market/industry thoroughly using web search. Structure your report with:
1. Market Overview (size, growth rate, key trends)
2. Market Segmentation (by geography, customer type, product type)
3. Key Players (market share, strengths, weaknesses)
4. Industry Trends (technology, regulation, consumer behavior)
5. Opportunities (gaps, underserved segments, emerging needs)
6. Challenges (barriers to entry, regulatory, competitive)
7. Outlook (2-5 year forecast with drivers)

Use real data and cite sources.`,

    competitive_analysis: `You are a competitive intelligence analyst. Research the competitive landscape thoroughly using web search. Structure your report with:
1. Overview (market context, why this analysis matters)
2. Competitor Profiles (for each competitor: overview, products, strengths, weaknesses, market position, recent moves)
3. Competitive Matrix (feature comparison table)
4. Positioning Map (how competitors are positioned)
5. Gaps & Opportunities (where competitors are weak)
6. Threats (strong competitive moves to watch)
7. Strategic Recommendations

Use real data and cite sources.`,

    person_company: `You are a research analyst preparing a background brief. Research the given person or company thoroughly using web search. Structure your report with:
1. Overview (who they are, what they do)
2. Background (history, founding, key milestones)
3. Current Focus (recent activities, projects, priorities)
4. Key People (leadership, board, notable team members)
5. Financial Overview (funding, revenue, valuation if available)
6. Industry Position (market position, partnerships, competitors)
7. Recent News (last 6 months)
8. Key Takeaways (what matters most for your context)

Use real data and cite sources.`,

    technology: `You are a technology analyst evaluating a tool, framework, or technology. Research it thoroughly using web search. Structure your report with:
1. Overview (what it is, what problem it solves)
2. Technical Architecture (how it works, key components)
3. Ecosystem (community, plugins, integrations)
4. Comparison (vs alternatives, pros/cons matrix)
5. Adoption (who uses it, case studies, market share)
6. Maturity (stability, roadmap, backing/funding)
7. Recommendation (when to use it, when not to)

Use real data and cite sources.`,
  };

  const depthConfig = {
    quick: { maxTokens: 2000, instruction: 'Keep it concise. Use 3-5 web searches. Focus on key facts only.' },
    standard: { maxTokens: 4000, instruction: 'Be thorough. Use 10-15 web searches. Include data points and sources.' },
    deep: { maxTokens: 8000, instruction: 'Be comprehensive. Use 15-25 web searches. Include detailed analysis, data, and multiple perspectives.' },
  };

  const depth = depthConfig[request.depth];
  const systemPrompt = systemPrompts[request.type] ?? systemPrompts.market_research;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: depth.maxTokens,
    system: `${systemPrompt}\n\n${depth.instruction}${request.context ? `\n\nAdditional context: ${request.context}` : ''}`,
    tools: [{
      type: 'web_search_20250305',
      name: 'web_search',
    } as any],
    messages: [{
      role: 'user',
      content: `Research: ${request.query}`,
    }],
  });

  // Extract the text content from the response
  const textBlocks = response.content.filter((b) => b.type === 'text');
  const fullText = textBlocks.map((b) => 'text' in b ? b.text : '').join('\n\n');

  // Parse sections from the markdown
  const sections = parseSections(fullText);

  // Extract verdict if present
  const verdictMatch = fullText.match(/(?:verdict|recommendation|conclusion)[:\s]*([^\n]+)/i);

  return {
    title: request.query,
    type: request.type,
    date: new Date().toISOString(),
    summary: sections[0]?.content?.slice(0, 500) ?? '',
    sections,
    sources: extractUrls(fullText),
    verdict: verdictMatch?.[1]?.trim(),
  };
}

// ─── Helpers ─────────────────────────────────────────────

function parseSections(text: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = text.split('\n');
  let currentHeading = 'Overview';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s\)]+/g;
  const matches = text.match(urlRegex) ?? [];
  return [...new Set(matches)];
}

function formatReport(report: ResearchReport): string {
  return `---
type: research-report
research_type: ${report.type}
date: ${report.date}
verdict: ${report.verdict ?? 'N/A'}
sources: ${report.sources.length}
---

# ${report.title}

**Type:** ${report.type.replace(/_/g, ' ')}
**Date:** ${new Date(report.date).toLocaleDateString('en-KE')}
${report.verdict ? `**Verdict:** ${report.verdict}` : ''}

---

${report.sections.map((s) => `## ${s.heading}\n\n${s.content}`).join('\n\n---\n\n')}

---

## Sources

${report.sources.map((url, i) => `${i + 1}. ${url}`).join('\n')}
`;
}

// ─── Start Server ────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '3007', 10);
app.listen(port, () => {
  console.log(`[agent-research] Listening on port ${port}`);
});
