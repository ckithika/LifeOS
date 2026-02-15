# Contributing to LifeOS

Thanks for your interest in contributing! LifeOS is a solo project and I appreciate thoughtful help.

## Humans Only

**Do not send AI-generated pull requests.** This means:

- No PRs where an AI wrote the code and you haven't personally reviewed every line
- No automated bots submitting PRs (Dependabot is fine since it's repo-owner configured)
- No "vibe coding" PRs where you prompted an AI and submitted the output without understanding it

**Why?** LifeOS is a complex system with multi-account routing, vault structure conventions, and MCP protocol requirements. AI-generated PRs tend to miss context, introduce subtle bugs, and create maintenance burden. I'd rather have one thoughtful PR than ten generated ones.

If you *use* AI to help you write code, that's fine — just make sure you understand and can defend every change.

## How to Contribute

1. **Open an issue first** — describe what you want to change and why
2. **Fork the repo** and create a feature branch
3. **Follow existing patterns** — look at how similar code is structured
4. **Test your changes** — at minimum, `npm run build` should pass
5. **Submit a PR** — fill out the template, check the human attestation box

## Architecture Overview

See [docs/architecture.md](docs/architecture.md) for the system design. Key things to know:

- **7-package TypeScript monorepo** — `packages/shared` is the foundation
- **MCP servers** handle requests at both `/` and `/mcp` endpoints
- **Each Cloud Run request** needs a fresh `McpServer` instance (stateless)
- **Vault uses folder-per-project** structure with configurable categories
- **Multi-account Google routing** uses `ACCOUNTS_CONFIG` for project-to-account mapping

## Areas Where Help Is Welcome

- Additional MCP tools
- Alternative vault backends (beyond GitHub)
- Alternative hosting (beyond Cloud Run)
- Microsoft 365 / Outlook support
- Slack integration
- Additional meeting capture sources (beyond Granola)
- Tests (unit tests for shared, integration tests for MCP tools)

## Development Setup

```bash
git clone https://github.com/ckithika/lifeos.git
cd lifeos
npm install
cp .env.example .env
# Fill in credentials (see docs/setup-guide.md)
npm run build
```

## Code Style

- TypeScript strict mode
- ESM modules (`.js` extensions in imports)
- Descriptive JSDoc comments on exported functions
- Minimal dependencies — prefer standard library where possible
