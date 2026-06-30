# NEMO-APP-v.1

Canonical hub for Prana Marketing Solutions and the **NEMO Workspace** product.

## Apps

| App | Port | Description |
|-----|------|-------------|
| [workspace](apps/workspace/) | 8420 | Guided AI workspace (factory + approvals) |
| [outbound-crm](apps/outbound-crm/) | 3010 | Hunter → rep phone queue |

## Workspace quick start

```bash
node scripts/create-workspace.mjs
pnpm install
pnpm dev
```

See [apps/workspace/README.md](apps/workspace/README.md) for full docs.

## Trunk docs

- [docs/ORGANIZATION.md](docs/ORGANIZATION.md) — **repo map, deploys, naming traps**
- [BUSINESS_PLAN.md](BUSINESS_PLAN.md)
- [PIPELINE.md](PIPELINE.md)
- [MILESTONES.md](MILESTONES.md)
- [STATUS.md](STATUS.md)
- [components.yaml](components.yaml)
