# Vault Structure Guide

This guide explains how LifeOS organizes the Obsidian vault and how to customize it.

## Default Structure (PARA-inspired)

```
Areas/                           ← everything lives under Areas
├── Projects/                    ← project folders by category
│   ├── Consulting/              ← client/consulting projects
│   │   └── {slug}/
│   │       ├── README.md        ← main project note (with frontmatter tags)
│   │       ├── meeting-notes.md ← chronological meeting log
│   │       └── files/           ← project attachments
│   ├── Node Works/              ← company projects
│   │   └── {slug}/
│   │       └── README.md
│   ├── Ideas/                   ← ideas and experiments
│   ├── Open Source/             ← open source work
│   └── Archive/                 ← completed/inactive projects
├── Hobbies/                     ← creative, physical, intellectual, social
├── Personal/                    ← finances, health, learning
Daily/                           ← daily notes (YYYY-MM-DD.md)
Templates/                       ← note templates
Files/                           ← system-generated files
├── Meetings/                    ← transcripts and summaries
├── Research/                    ← research reports
├── Reports/                     ← generated reports
└── Inbox/                       ← email attachments by contact
    └── {contact-name}/
        ├── received/
        └── sent/
```

## Customization

There are three ways to configure the vault structure:

### 1. AI-Personalized (recommended)

When setting up LifeOS with any AI coding assistant (Claude Code, Cursor, Codex, etc.), describe your workflow and the AI will generate a config:

**Prompt template for any AI assistant:**

> Ask the user: "Describe your work and how you'd like to organize projects. For example: Are you a freelancer with multiple clients? An employee working on team projects? A student? Do you have side projects?"
>
> Based on their answer, generate a `VaultStructureConfig`:
> - `projectCategories`: folder names under Areas/Projects/ (e.g., ["Clients", "Internal", "Archive"] for a freelancer)
> - `projectSubfolders`: folders inside each project (e.g., ["files", "contracts", "deliverables"] for consulting)
> - `projectTags`: frontmatter tags for cross-cutting classification
>
> Output the config as environment variables for `.env`.

### 2. Adopt Existing Vault

If the user already has an Obsidian vault with an established structure:

1. Scan the vault repo for top-level directories
2. Identify which folders contain project-like content (notes with status, categories)
3. Map existing folders to `projectCategories`
4. Suggest a migration path that preserves existing organization

### 3. Generic Defaults

For users who skip customization, the defaults work well:

```bash
VAULT_CATEGORIES='["Work","Personal","Archive"]'
PROJECT_SUBFOLDERS='["files"]'
PROJECT_TAGS='["status/active","status/paused","status/done","type/client","type/product","type/personal"]'
```

## Example Configs by Persona

### Freelancer / Consultant

```bash
VAULT_CATEGORIES='["Clients","Internal","Archive"]'
PROJECT_SUBFOLDERS='["files","contracts","deliverables"]'
PROJECT_TAGS='["status/active","status/paused","status/done","type/client","type/internal","priority/high","priority/low"]'
```

### Employee at a Company

```bash
VAULT_CATEGORIES='["Work","Side-Projects","Archive"]'
PROJECT_SUBFOLDERS='["files"]'
PROJECT_TAGS='["status/active","status/paused","status/done","team/engineering","team/product","priority/high"]'
```

### Student

```bash
VAULT_CATEGORIES='["Courses","Projects","Archive"]'
PROJECT_SUBFOLDERS='["files","assignments"]'
PROJECT_TAGS='["status/active","status/done","semester/spring-2026","type/course","type/research"]'
```

### Founder / Multi-Project

```bash
VAULT_CATEGORIES='["Products","Ventures","Consulting","Archive"]'
PROJECT_SUBFOLDERS='["files","legal","financials"]'
PROJECT_TAGS='["status/active","status/paused","status/done","type/product","type/service","stage/idea","stage/mvp","stage/growth"]'
```

## Tags Strategy

Tags live in frontmatter YAML and optionally inline. This avoids deep folder nesting while enabling powerful filtering via Obsidian Dataview and graph view.

### Project README.md Frontmatter

```yaml
---
title: "Project Name"
status: active
created: 2026-01-15
category: Work
tags: [type/client, priority/high, q1-2026]
---
```

### Auto-Tagging by Agents

LifeOS agents automatically add tags when creating or updating notes:
- `agent-sync` adds `synced/gmail`, `synced/drive`
- `agent-granola` adds `type/meeting`, `source/granola`
- `agent-briefing` adds `type/briefing`
- `agent-research` adds `type/research`

### Recommended Base Tags

- **Status:** `status/active`, `status/paused`, `status/done`
- **Type:** `type/client`, `type/product`, `type/personal`, `type/meeting`, `type/research`
- **Priority:** `priority/high`, `priority/low`

Users can add custom tags for their domain (e.g., `team/engineering`, `semester/spring-2026`).

## VaultStructureConfig Schema

```typescript
interface VaultStructureConfig {
  /** Folder names under Areas/Projects/ */
  projectCategories: string[];      // default: ['Work','Personal','Archive']
  /** Subfolders inside each project folder */
  projectSubfolders: string[];      // default: ['files']
  /** Frontmatter tags for project notes */
  projectTags: string[];            // default: ['status/active','status/paused',...]
}
```

All values are set via environment variables and can be overridden without code changes:

| Env Variable | Type | Default |
|---|---|---|
| `VAULT_CATEGORIES` | JSON array | `["Work","Personal","Archive"]` |
| `PROJECT_SUBFOLDERS` | JSON array | `["files"]` |
| `PROJECT_TAGS` | JSON array | `["status/active",...]` |
