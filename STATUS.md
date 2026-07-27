# STATUS

> Auto-updated by the [aggregator workflow](.github/workflows/aggregate-status.yml)
> from nightly `[status]` Issues opened by each component. Manual edits
> below the marker are preserved.

<!-- BEGIN_AUTO_STATUS -->

_Last aggregated: 2026-07-27T19:49:39.757Z_

| Component | State | Last reported | Summary |
|---|---|---|---|
| openclaw | unknown | — | — |
| paperclip-workspace | unknown | — | — |
| nemo-local | unknown | — | — |
| nemo-agent | unknown | — | — |
| mktg-chrome-extension | unknown | — | — |
| autoagent | unknown | — | — |

<!-- END_AUTO_STATUS -->

## How to read this

- `green` — component reported on time, no failures, metrics within budget
- `yellow` — component reported on time but flagged a soft issue (e.g.
  flaky test, low-but-non-zero error rate, approaching budget)
- `red` — component reported a hard failure, OR was silent past its
  cadence tolerance
- `unknown` — no report received yet

A `red` persisting > 24h opens an `escalation` Issue.

## Manual notes

(Edit below this line; everything above is overwritten by the aggregator.)

- 2026-06-30 — Retired `sentientsprite/nemo-workspace` GitHub repo ([ADR 0002](decisions/0002-retire-nemo-workspace-repo.md)). OpenClaw config → `~/.openclaw/`; workflow factory → `apps/workspace`.
