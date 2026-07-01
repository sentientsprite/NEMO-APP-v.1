# ADR 0002 — Retire `sentientsprite/nemo-workspace`

**Status:** accepted (2026-06-30)  
**Supersedes:** dashboard + agent config living in a standalone GitHub repo

## Context

The GitHub repo `sentientsprite/nemo-workspace` was the **legacy OpenClaw dashboard**
(agent personas, memory, references, pipeline view). The productized workflow factory
now lives in **`NEMO-APP-v.1/apps/workspace`**, deployed to **nemo-workspace.vercel.app**.

Keeping both caused naming confusion (“nemo-workspace” = repo vs Vercel vs product name).

## Decision

1. **Delete** `sentientsprite/nemo-workspace` on GitHub after confirming nothing deploys from it.
2. **Preserve the pattern**, not the repo: per-tenant `AGENTS.md` / `MEMORY.md` bundles are
   documented in `PRODUCT_PLAN.md` and implemented in trunk templates (`templates/workspaces/`).
3. **Remove** the component from `components.yaml` and trunk status aggregation.
4. OpenClaw runtime config stays in **`~/.openclaw/`** and **`sentientsprite/openclaw`**.

## Consequences

- Trunk loop no longer expects nightly status from `nemo-workspace`.
- Any links to the old repo should point to trunk `apps/workspace` or OpenClaw docs.
- Vercel project **`nemo-workspace`** is unchanged — it deploys trunk, not the deleted repo.

## Deletion command (requires `delete_repo` scope)

```bash
gh auth refresh -h github.com -s delete_repo
gh repo delete sentientsprite/nemo-workspace --yes
```

Optional: archive a final tarball locally before delete if you want historical dashboard JSON.
