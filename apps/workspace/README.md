# NEMO Workspace

Installable AI operations workspace — guided workflows with memory, approvals, and verification.

Built on the **software factory** model (research → story → brief → build → verify → validate) but exposed to users as simple stages:

**Understand → Plan → Approve → Execute → Verify → Report**

## Quick start

```bash
# From NEMO-APP-v.1 root
node scripts/create-workspace.mjs    # creates .nemo-workspace + .env.local
pnpm install
pnpm dev
```

Open [http://localhost:8420](http://localhost:8420)

## Monorepo layout

```text
apps/
  workspace/          # Next.js dashboard (port 8420)
  outbound-crm/       # Prana outbound CRM (separate app)
packages/
  agents/             # Agent roles, templates, demo outputs
  orchestrator/       # Workflow engine + approval gates
  memory/             # File-based memory index + search
templates/
  workspaces/default/ # Seed MEMORY.md, DNA.md, references
scripts/
  create-workspace.mjs
```

## Features (MVP)

- **Dashboard** — Needs approval, Running, Done, Risks buckets
- **Workflow templates** — Research business, analyze docs, notes → tasks
- **Approval gates** — Story and brief checkpoints before build
- **Memory layer** — Index markdown, search with citations, add notes
- **Audit log** — Every workflow action recorded
- **Demo + live modes** — Full factory flow without API keys, or Vercel AI Gateway when configured

## Environment

```bash
# apps/workspace/.env.local
NEMO_WORKSPACE_ROOT=/path/to/.nemo-workspace

# Optional live generation
NEMO_AI_MODE=live
NEMO_AI_MODEL=anthropic/claude-sonnet-4.6
```

Live mode uses the Vercel AI Gateway through the AI SDK. For local development,
run `vercel link` and `vercel env pull apps/workspace/.env.local`, or provide an
`AI_GATEWAY_API_KEY` in non-Vercel environments. If live generation fails,
NEMO falls back to demo output unless `NEMO_AI_STRICT=1` is set.

## Relation to other repos

| Repo | Role in product |
|------|-----------------|
| `nemo-workspace` | Pattern source (dashboard, DNA, memory model) |
| `NEMO-APP-v.1` | Product trunk (this repo) |
| OpenClaw / Paperclip | Orchestration concepts (approval gate, audit) |

## Next steps

1. Vector embeddings for large document sets
2. PDF, URL, and CSV importers
3. Desktop packaging (Tauri)
4. Onboarding wizard + beta installer
