# ADR 0001 — NEMO-APP-v.1 is the trunk

Date: 2026-04-29
Status: Accepted

## Context

Prana Marketing Solutions has accumulated multiple repositories
(`openclaw`, `nemo-agent`, `nemo-workspace`, `paperclip-workspace`,
`MKTG-Chrome-Extenstion`, `autoagent`, plus local-only `pinchtab`).
Strategy and product decisions were drifting across READMEs in different
repos, with no single source of truth. There was also no way to know at
a glance whether the autonomous stack was healthy.

A separate effort (`autoagent/nemo-saas/`) had begun building a
multi-tenant B2B SaaS, which is a *different product* than the agency
business plan and risked diverging from Prana's near-term goals.

## Decision

`NEMO-APP-v.1` is the canonical trunk repository for Prana Marketing
Solutions:

1. The business plan, ICP, pricing, milestones, and active pipeline
   live here and only here. (`BUSINESS_PLAN.md`, `PIPELINE.md`,
   `MILESTONES.md`)
2. Every other repo declares its role here via `components.yaml` and
   in its own `.prana/component.yaml`.
3. Every other repo reports nightly status to this trunk via the
   `report-to-prana.yml` workflow; the aggregator updates `STATUS.md`.
4. Architectural decisions affecting more than one repo are recorded
   here as ADRs under `decisions/`. Per-repo ADRs stay in their repo.
5. The Nemo SaaS work in `autoagent/nemo-saas/` is reframed as a
   **Phase 4 productization track**, gated by hitting the Sept 30 MRR
   milestone (M-SEP-30). It is not the current product.

## Consequences

- Single place for Raymond to look each morning (STATUS.md + PIPELINE.md).
- Component repos shrink — no more strategy in their READMEs.
- Nemo SaaS work isn't deleted; it's tagged as Phase 4 and remains
  ready to activate post-validation.
- Cross-repo silence is now detectable (status-stale issues).
- Adding a new component is a documented 5-step checklist.

## Non-decisions (deferred)

- Whether `nemo-agent` will replace `openclaw` — Validator agent owns
  the comparison. Deferred until M-MAY-31.
- Whether to make `pinchtab` a public repo — deferred until its surface
  area outgrows `~/.pinchtab/config.json`.
- White-label / agency tier on the Phase 4 SaaS — deferred to a
  separate ADR after M-PHASE4-WEDGE.
