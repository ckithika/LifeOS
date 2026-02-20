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
 * Uses Gemini with Google Search grounding for real-time research.
 * Results saved to vault as structured Markdown reports.
 *
 * Trigger: POST /research (called by MCP server or manually)
 */

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

import { writeFile, isVaultConfigured, formatDate } from '@lifeos/shared';
import type { ResearchRequest, ResearchReport } from '@lifeos/shared';

const app = express();
app.use(express.json());

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

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
    business_viability: `You are a business analyst conducting a viability assessment. Research the given business idea thoroughly. Structure your report with these sections:
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

    market_research: `You are a market research analyst. Research the given market/industry thoroughly. Structure your report with:
1. Market Overview (size, growth rate, key trends)
2. Market Segmentation (by geography, customer type, product type)
3. Key Players (market share, strengths, weaknesses)
4. Industry Trends (technology, regulation, consumer behavior)
5. Opportunities (gaps, underserved segments, emerging needs)
6. Challenges (barriers to entry, regulatory, competitive)
7. Outlook (2-5 year forecast with drivers)

Use real data and cite sources.`,

    competitive_analysis: `You are a competitive intelligence analyst. Research the competitive landscape thoroughly. Structure your report with:
1. Overview (market context, why this analysis matters)
2. Competitor Profiles (for each competitor: overview, products, strengths, weaknesses, market position, recent moves)
3. Competitive Matrix (feature comparison table)
4. Positioning Map (how competitors are positioned)
5. Gaps & Opportunities (where competitors are weak)
6. Threats (strong competitive moves to watch)
7. Strategic Recommendations

Use real data and cite sources.`,

    person_company: `You are a research analyst preparing a background brief. Research the given person or company thoroughly. Structure your report with:
1. Overview (who they are, what they do)
2. Background (history, founding, key milestones)
3. Current Focus (recent activities, projects, priorities)
4. Key People (leadership, board, notable team members)
5. Financial Overview (funding, revenue, valuation if available)
6. Industry Position (market position, partnerships, competitors)
7. Recent News (last 6 months)
8. Key Takeaways (what matters most for your context)

Use real data and cite sources.`,

    technology: `You are a technology analyst evaluating a tool, framework, or technology. Research it thoroughly. Structure your report with:
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
    quick: { maxTokens: 2000, instruction: 'Keep it concise. Focus on key facts only.' },
    standard: { maxTokens: 4000, instruction: 'Be thorough. Include data points and sources.' },
    deep: { maxTokens: 8000, instruction: 'Be comprehensive. Include detailed analysis, data, and multiple perspectives.' },
  };

  const depth = depthConfig[request.depth];
  const systemPrompt = systemPrompts[request.type] ?? systemPrompts.market_research;
  const model = process.env.RESEARCH_MODEL || 'gemini-2.5-pro';

  const ai = getClient();

  const response = await ai.models.generateContent({
    model,
    contents: `Research: ${request.query}`,
    config: {
      maxOutputTokens: depth.maxTokens,
      systemInstruction: `${systemPrompt}\n\n${depth.instruction}${request.context ? `\n\nAdditional context: ${request.context}` : ''}`,
      tools: [{ googleSearch: {} }],
    },
  });

  const fullText = response.text ?? '';

  // Extract grounding sources from metadata
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const groundingSources = groundingChunks
    .filter((c: any) => c.web?.uri)
    .map((c: any) => c.web.uri as string);

  // Also extract any URLs from the text itself
  const textUrls = extractUrls(fullText);
  const allSources = [...new Set([...groundingSources, ...textUrls])];

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
    sources: allSources,
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
**Date:** ${formatDate(new Date(report.date))}
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
