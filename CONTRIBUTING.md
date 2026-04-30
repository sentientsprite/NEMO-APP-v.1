# Contributing — cross-repo coordination

> How every component repo connects to and reports into NEMO-APP-v.1.

## The contract

Every repo listed in [`components.yaml`](components.yaml) agrees to:

1. **Declare its role** in `.prana/component.yaml` (copied from
   [`templates/component.yaml.example`](templates/component.yaml.example)).
2. **Link back** in its `README.md` using
   [`templates/child-readme-footer.md`](templates/child-readme-footer.md).
3. **Report status nightly** via the GitHub Action in
   [`templates/report-to-prana.yml`](templates/report-to-prana.yml),
   which opens an Issue here tagged `component-status`.
4. **Defer business strategy** to this repo. Component repos describe
   *how* they work; the trunk describes *why*.

## Status report protocol

Each nightly report opens an Issue here with this title:

```
[status] <component-id> — <YYYY-MM-DD>
```

Body uses the schema in [`.github/ISSUE_TEMPLATE/component-status.yml`](.github/ISSUE_TEMPLATE/component-status.yml).
Required fields:

- `component` — must match a `components[].id` value
- `state` — one of `green` / `yellow` / `red`
- `summary` — one-line headline (≤ 80 chars)
- `metrics` — JSON object with whatever metrics that component tracks
  (e.g. `{ "tests_passed": 42, "tests_failed": 0, "agent_runs_24h": 7 }`)
- `links` — optional array of CI run URLs, dashboard URLs, etc.

The aggregator workflow rolls these into [`STATUS.md`](STATUS.md) and
auto-closes the issue once aggregated. Anything `red` for > 24h gets
escalated as a separate Issue tagged `escalation`.

## Cadence

Each component declares its own `cadence` in `.prana/component.yaml`
(values: `nightly`, `weekly`, `release-driven`, `not_reported`).
The aggregator opens a `status-stale` Issue when a component goes
silent past its tolerance (48h for nightly, 14d for weekly).

See [`components.yaml`](components.yaml) for the current cadence per
component — that file is the source of truth, not this doc.

## Branching + PR conventions

Within a component repo:

- Default branch: `main`
- Feature branches: `feat/<short-slug>`
- Fix branches: `fix/<short-slug>`
- ADRs that touch business strategy go *here*, not in the component
- ADRs that touch component internals go *in the component*

PRs touching `components.yaml` or `BUSINESS_PLAN.md` here require a
human review (Raymond). Everything else can be merged by the bot once
CI is green.

## Issue labels (this repo)

| Label | Meaning |
|---|---|
| `component-status` | Auto-opened nightly status report (auto-closed by aggregator) |
| `escalation` | A `red` status persisted > 24h, needs Raymond |
| `status-stale` | A component went silent past its tolerance |
| `add-on:beacon` / `add-on:echo` / `add-on:bloom` | Tagged work for a specific add-on |
| `agent:aria` / `agent:hunter` / `agent:scout` / `agent:architect` / `agent:validator` | Work owned by a specific agent |
| `tier:spark` / `tier:flow` / `tier:prana` | Work for a specific service tier |
| `client:<slug>` | Work tied to a specific client (white-pine, monkey-wrench, etc.) |
| `phase:4-saas` | Work toward the Phase 4 Nemo SaaS productization (post-Sept 30) |

## Adding a new repo

1. Add a row to [`components.yaml`](components.yaml).
2. Update the table in [`README.md`](README.md).
3. Apply the templates in the new repo (see `templates/` here).
4. Open a PR. Once merged, the aggregator starts expecting reports.

## When two components disagree

If two component repos imply contradictory behavior (e.g. dashboard says
Aria approved a post but openclaw logs say no), open an Issue here with
the `escalation` label. The trunk is the arbiter — both components must
update their state to match what's recorded here.

## Phase 4 (Nemo SaaS) note

The `autoagent` repo includes a `nemo-saas/` directory that contains a
Next.js + Supabase + Inngest scaffold for the eventual SaaS
productization of Prana's stack. It is **not** the current product. It
is a Phase 4 track that activates after Prana hits the Sept 30 MRR
milestone in [`MILESTONES.md`](MILESTONES.md). Do not merge SaaS
multi-tenancy into the agency runtime before that gate.
