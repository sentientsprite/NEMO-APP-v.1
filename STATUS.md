# STATUS

> Auto-updated by the [aggregator workflow](.github/workflows/aggregate-status.yml)
> from nightly `[status]` Issues opened by each component. Manual edits
> below the marker are preserved.

<!-- BEGIN_AUTO_STATUS -->

_Last aggregated: 2026-05-04T07:24:11.305Z_

| Component | State | Last reported | Summary |
|---|---|---|---|
| openclaw | unknown | — | — |
| paperclip-workspace | unknown | — | — |
| nemo-workspace | unknown | — | — |
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

- 2026-04-29 — Trunk created. Components not yet wired with the
  reporter workflow. First nightly aggregation runs once at least one
  component pushes a status Issue.
