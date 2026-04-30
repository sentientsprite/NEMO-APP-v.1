# MILESTONES

Stable IDs for every dated milestone in
[`BUSINESS_PLAN.md`](BUSINESS_PLAN.md) §7. Reference these from ADRs,
component status reports, and the Phase 4 gate.

| ID | Date | Milestone | Status | Owner | Source |
|---|---|---|---|---|---|
| M-MAR-20 | 2026-03-20 | Local setup complete | done | Raymond | BUSINESS_PLAN §7 |
| M-MAR-27 | 2026-03-27 | Stripe + approval gate | done | Raymond | BUSINESS_PLAN §7 |
| M-APR-03 | 2026-04-03 | 20 prospect DMs sent | pending | Raymond | BUSINESS_PLAN §7 |
| M-APR-15 | 2026-04-15 | First discovery call | pending | Raymond | BUSINESS_PLAN §7 |
| M-APR-30 | 2026-04-30 | First paid client | pending | Raymond + Aria | BUSINESS_PLAN §7 |
| M-MAY-15 | 2026-05-15 | Beacon launched | pending | Raymond + Hunter | BUSINESS_PLAN §7 |
| M-MAY-31 | 2026-05-31 | Flow upsell + first Beacon sale | pending | Raymond + Aria | BUSINESS_PLAN §7 |
| M-JUN-15 | 2026-06-15 | Echo launched | pending | Raymond + Hunter | BUSINESS_PLAN §7 |
| M-JUN-30 | 2026-06-30 | 2nd client signed + first Echo sale | pending | Hunter + Raymond | BUSINESS_PLAN §7 |
| M-JUL-15 | 2026-07-15 | Bloom launched | pending | Raymond + Hunter | BUSINESS_PLAN §7 |
| M-JUL-31 | 2026-07-31 | $3,000 MRR + first Bloom sale | pending | System | BUSINESS_PLAN §7 |
| M-SEP-30 | 2026-09-30 | $4,500+ verified MRR (Phase 4 gate) | pending | System | BUSINESS_PLAN §7 + ADR-0001 |

## Status legend

- **done** — verified, dated.
- **pending** — scheduled, not yet hit.
- **at-risk** — flagged red in STATUS.md.
- **slipped** — date passed without completion; reason in PR/issue link.

## Phase 4 gate

`M-SEP-30` is the activation gate for the Nemo SaaS productization track
([`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md), referenced by
[`decisions/0001-nemo-app-v1-is-the-trunk.md`](decisions/0001-nemo-app-v1-is-the-trunk.md)).
Until `M-SEP-30` flips to `done`, the `autoagent/nemo-saas/` scaffold
stays dormant.

## How to reference these IDs

- **In a component status report**: include `milestone: M-MAY-15` in the
  metrics JSON when the report's work is in service of that milestone.
- **In an ADR**: cite by ID (e.g. "deferred until M-MAY-31").
- **In a PR title**: prefix with the ID (e.g. `[M-MAY-15] Beacon
  Monitor sub-role for Hunter`).
- **In an Issue**: add a label `milestone:m-may-15`.
