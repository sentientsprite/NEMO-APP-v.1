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

## Storage

The memory index and workflow state use a pluggable `KvStore`:

- **file** (default locally) — writes to `.nemo-workspace/` on disk; ideal for
  desktop/local use.
- **blob** (default on Vercel) — uses Vercel Blob so state persists on the
  read-only serverless filesystem. Auto-selected when `BLOB_READ_WRITE_TOKEN`
  is present or when running on Vercel.

## Deployment tiers

Three Vercel projects (or env configs) map to product tiers:

| Tier | `NEMO_TIER` | URL (example) | Behavior |
|------|-------------|---------------|----------|
| **Live Demo** | `demo` | nemo-workspace.vercel.app | Real URL fetch + grounded excerpts. No AI key. Clearly labeled. |
| **Pro** | `paywall` | nemo-workspace-pro.vercel.app | Live AI via Gateway. Blocks honestly when credits unavailable. |
| **Production** | `production` | your domain | Strict live AI only — fails if model unavailable. |

See `/pricing` in the app for details. Each tier uses the same codebase; only env vars differ.

## Postgres + job queue

When `SUPABASE_SERVICE_ROLE_KEY` is set, workflows, audit log, plans, and the job queue use Supabase Postgres. Memory/documents stay on Blob or local file storage.

1. Apply migration: `apps/workspace/supabase/migrations/20260628000000_nemo_workspace_core.sql`
2. Set env vars (see `.env.example`)
3. Set `CRON_SECRET` and optionally enable Vercel cron (`vercel.json`)

Workflow stages run **one per job** via `POST /api/jobs/process` (Bearer `CRON_SECRET`), avoiding serverless timeouts.

Run URL research regression evals:

```bash
pnpm --filter @nemo/workspace eval:url-research
NEMO_EVAL_LIVE_FETCH=1 pnpm --filter @nemo/workspace eval:url-research
```

## Environment

```bash
# apps/workspace/.env.local
NEMO_TIER=demo          # demo | paywall | production
NEMO_STORAGE=file
NEMO_WORKSPACE_ROOT=/path/to/.nemo-workspace
NEMO_AI_MODEL=anthropic/claude-sonnet-4.6
```

**Demo tier** never calls the AI Gateway — it summarizes fetched URL text extractively.

**Paywall tier** calls the Gateway; if credits are missing, stages show a Pro upgrade message (no silent fake output).

**Production tier** requires live AI (`NEMO_AI_STRICT=1` behavior).

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
