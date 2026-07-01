# Prana / NEMO — organization map

> **Purpose:** One page that says what each repo does, where it deploys, and how it
> connects. Read this before opening a random folder or Vercel project.

---

## Layers (top → bottom)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  L0  TRUNK          NEMO-APP-v.1 — strategy, milestones, apps, STATUS    │
├──────────────────────────────────────────────────────────────────────────┤
│  L1  WEDGES         Public lead magnets (audit → email → CRM)          │
│      spryte-site    Site audit lead magnet                                    │
│      nemo-app-v-1   GBP Local Visibility Score                           │
├──────────────────────────────────────────────────────────────────────────┤
│  L2  OPERATIONS     Internal tools                                       │
│      nemo-workspace (Vercel)  Agent workflow factory (this chat's app)   │
│      outbound-crm             Lead queue for reps                        │
├──────────────────────────────────────────────────────────────────────────┤
│  L3  RUNTIME        Autonomous stack (Mac Mini, local-first)           │
│      ~/symbiote/spryte   Daemon + PinchTab + MLX + auditor               │
│      openclaw            Named agents (Hunter, Aria, …)                  │
│      paperclip-workspace Approval gate (PRANA-EXECUTE)                   │
├──────────────────────────────────────────────────────────────────────────┤
│  L4  QUALITY        Skill regression + future SaaS packaging             │
│      autoagent/tasks     Harbor SkillEval                                  │
│      autoagent/nemo-saas Phase 4 multi-tenant scaffold (GBP wedge code)  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Data flow:** Wedge → Outbound CRM → (optional) NEMO Workspace for deep agent work.

---

## Deployments ↔ source ↔ status

| Production URL | Vercel project | Source code | Role | Prod status |
|----------------|----------------|-------------|------|-------------|
| [spryte-site.vercel.app](https://spryte-site.vercel.app) | `spryte-site` | `sentientsprite/spryte` → `apps/web` | Site audit lead magnet | **Live** — leads persist via Supabase |
| [nemo-app-v-1.vercel.app](https://nemo-app-v-1.vercel.app) | `nemo-app-v-1` | `sentientsprite/autoagent` → `nemo-saas/` | GBP Local Visibility Score + PDF | **Degraded** — missing `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY` |
| [nemo-workspace.vercel.app](https://nemo-workspace.vercel.app) | `nemo-workspace` | `NEMO-APP-v.1` → `apps/workspace` | 7-agent workflow factory (demo tier) | **Live demo** — Blob storage; Postgres queue not wired |
| [outbound-crm-five.vercel.app](https://outbound-crm-five.vercel.app) | `outbound-crm` | `NEMO-APP-v.1` → `apps/outbound-crm` | Rep phone queue / Hunter webhook | **Live** — Supabase connected |

Local-only (no public deploy):

| Path | Role |
|------|------|
| `~/symbiote/spryte` | Full stack: `./scripts/start-stack.sh` → PinchTab + MLX + web :3000 |
| `~/.openclaw/` | OpenClaw agent runtime + cron |
| `~/.pinchtab/` | Browser automation config |

---

## Naming traps (read this)

| Name | What people think | What it actually is |
|------|-------------------|---------------------|
| **nemo-workspace** (GitHub repo) | The workflow app | **Retired** — was legacy OpenClaw dashboard; deleted 2026-06-30 ([ADR 0002](../decisions/0002-retire-nemo-workspace-repo.md)) |
| **nemo-workspace** (Vercel) | Same as above | **`apps/workspace`** in NEMO-APP-v.1 — the new factory UI |
| **NEMO Workspace** | One product | Product name for `apps/workspace`; not the GitHub `nemo-workspace` repo |
| **spryte** (GitHub) | The website only | Monorepo: web + auditor + daemon + MLX (`~/symbiote/spryte` locally) |
| **autoagent/spryte** | Same as symbiote/spryte | **Subset** — web app copy inside autoagent; no Symbiote daemon |
| **nemo-saas** | The whole company | **Phase 4 scaffold** inside autoagent; deploys as `nemo-app-v-1` |
| **autoagent** | Customer product | **SkillEval harness** + dormant SaaS scaffold; not the wedge itself |

**Rule of thumb:** If it has a `.vercel.app` URL, check the table above. If it runs on the Mac Mini, it's Layer 3.

---

## Repo directory (where to work)

| When you want to… | Work in… |
|-------------------|----------|
| Fix site audits / `/audit` | `~/symbiote/spryte` (or `sentientsprite/spryte`) |
| Boot PinchTab + MLX locally | `~/symbiote/spryte` → `pnpm stack` |
| Fix GBP wedge / LVS PDF email | `~/autoagent/nemo-saas` |
| Add Harbor regression for a skill | `~/autoagent/tasks/` |
| Run 7-agent workflows + approvals | `NEMO-APP-v.1/apps/workspace` |
| Triage leads / Hunter webhook | `NEMO-APP-v.1/apps/outbound-crm` |
| Change business plan / milestones | `NEMO-APP-v.1` root docs |
| Tune overnight agent harness | `~/autoagent/agent.py` + `program.md` |
| OpenClaw agents / cron | `~/.openclaw/` + `openclaw` repo |

---

## Autonomy spectrum

| System | Human in loop? | Scope |
|--------|----------------|-------|
| OpenClaw + Paperclip | Yes — PRANA-EXECUTE approvals | Full agent ops |
| Symbiote daemon | Yes — for risky fixes only | Service health |
| Spryte `/audit` | No — autorun on URL | One audit skill |
| Nemo Local `/api/lvs` | No — autorun on form | One GBP skill |
| NEMO Workspace | **Yes — 2 approval gates** | General multi-agent workflows |
| autoagent meta-harness | No — overnight hill-climb | Harness tuning only |

**Fully autonomous agent management** = Layer 3 (OpenClaw + Symbiote + PinchTab + MLX), not any single Vercel app.

---

## Running autoagent locally (`~/autoagent`)

**autoagent** is two things in one repo — pick the path you need:

### A. SkillEval harness (regression tests for skills)

Tests the agent harness against Harbor task packs in `tasks/`. Use this before shipping skill changes.

```bash
cd ~/autoagent
curl -LsSf https://astral.sh/uv/install.sh | sh   # if needed
uv sync
docker build -f Dockerfile.base -t autoagent-base .

# Single LVS case
rm -rf jobs && mkdir -p jobs
uv run harbor run \
  -p tasks/local_visibility_audit/case_01_missing_phone_and_low_reviews/ \
  -l 1 -n 1 --agent-import-path agent:AutoAgent \
  -o jobs --job-name lvs_01

# Full suite (parallel)
uv run harbor run -p tasks/ -n 4 \
  --agent-import-path agent:AutoAgent \
  -o jobs --job-name skilleval-nightly

uv run harbor view jobs/   # → http://localhost:8000
```

**Meta-agent loop** (overnight harness tuning): edit `program.md`, then point a coding agent at the repo with *"Read program.md and kick off a new experiment."* It edits `agent.py` and hill-climbs on benchmark scores.

**Requires:** Docker, Python 3.10+, `uv`, model API keys in `.env` (see root `README.md`).

### B. Nemo SaaS / GBP wedge (`nemo-saas/`)

Local copy of what deploys as **nemo-app-v-1.vercel.app**. Full guide: [`autoagent/nemo-saas/QUICKSTART.md`](https://github.com/sentientsprite/autoagent/blob/main/nemo-saas/QUICKSTART.md).

```bash
cd ~/autoagent/nemo-saas
pnpm install
cp .env.example .env.local
openssl rand -base64 32   # → NEMO_TENANT_KMS_KEY in .env.local

supabase start && supabase db reset   # local Postgres + schema

# Terminal 1
pnpm dev                              # http://localhost:3000

# Terminal 2
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest

# Smoke test
curl -sS -X POST http://localhost:3000/api/lvs \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","businessName":"Greenline Landscaping","zip":"80302"}' | jq
```

**Optional keys:** `GOOGLE_MAPS_API_KEY` (real GBP), `OPENAI_API_KEY` (narrative), `RESEND_API_KEY` (email). Without them the wedge still runs with fixture-grade output.

**Not autoagent:** Symbiote full stack (`~/symbiote/spryte` → `pnpm stack`) is separate — PinchTab + MLX + site auditor, not Harbor.

---

## Recommended consolidation (don't rush)

Already in trunk (`NEMO-APP-v.1`):

- `apps/outbound-crm` ✓
- `apps/workspace` ✓

**Next candidates** (see [MONOREPO_ROADMAP.md](./MONOREPO_ROADMAP.md)):

1. **`autoagent/nemo-saas`** → `apps/nemo-local` (GBP wedge; keeps SkillEval in autoagent or `packages/skills`)
2. **`spryte/apps/web`** → `apps/spryte-site` (after symlink/dedup with `autoagent/spryte`)
3. Leave **OpenClaw / Paperclip / Symbiote daemon** local — merging git history doesn't simplify Mac Mini ops

**Do not merge** until deploy roots and env var names are documented per app.

---

## Env vars checklist (production)

| App | Must have for "real" behavior |
|-----|------------------------------|
| **spryte-site** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (lead persist) |
| **nemo-app-v-1** | `GOOGLE_MAPS_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **nemo-workspace** | `BLOB_READ_WRITE_TOKEN`; optional Supabase for queue |
| **outbound-crm** | Supabase triple + `HUNTER_WEBHOOK_SECRET` |

Cross-app webhook (already wired for LVS → CRM):

- `OUTBOUND_CRM_WEBHOOK_URL` + `HUNTER_WEBHOOK_SECRET` on nemo-app-v-1

---

## Morning checklist (Raymond)

1. **STATUS.md** — any component red?
2. **PIPELINE.md** — active deals
3. **Wedges** — quick smoke: spryte-site `/audit`, nemo-app-v-1 form
4. **CRM** — outbound-crm queue
5. **Mac Mini** — `pnpm tui` in symbiote/spryte if running local stack

---

## Related docs

- [WEDGE_ENV_SETUP.md](./WEDGE_ENV_SETUP.md) — production env for spryte-site + nemo-app-v-1
- [components.yaml](../components.yaml) — machine-readable component list
- [MONOREPO_ROADMAP.md](./MONOREPO_ROADMAP.md) — subtree merge plan
- [decisions/0001-nemo-app-v1-is-the-trunk.md](../decisions/0001-nemo-app-v1-is-the-trunk.md)
- [BUSINESS_PLAN.md](../BUSINESS_PLAN.md) — ICP, Beacon/Echo/Bloom SKUs
