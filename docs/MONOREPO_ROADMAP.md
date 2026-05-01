# Monorepo roadmap (post-MVP)

> **Status:** Planning only. No merge of `autoagent`, `openclaw`, or other component repos into this trunk is executed as part of the Outbound CRM MVP — or as part of authoring this document.

This file describes **how** Prana Marketing Solutions *could* consolidate the satellite repositories listed in [`components.yaml`](../components.yaml) into [`NEMO-APP-v.1`](https://github.com/sentientsprite/NEMO-APP-v.1) using **git subtree**, **JavaScript/TypeScript workspaces**, or a **hybrid**. It exists so future work has a decision scaffold and does not fork reality silently.

---

## 1. Why consider a monorepo at all?

**Today:** The trunk holds strategy, pipeline, milestones, status aggregation, and **apps** such as [`apps/outbound-crm/`](../apps/outbound-crm/). Runtime code for agents, dashboards, SkillEval, and Phase 4 SaaS mostly lives in **separate GitHub repos** with a nightly “report to trunk” protocol ([`CONTRIBUTING.md`](../CONTRIBUTING.md)).

**Pressures that eventually favor consolidation:**

- Atomic PRs that touch Hunter → outbound CRM **and** SkillEval asserts **and** dashboard copy.
- One CI graph: lint/test/deploy without chasing seven pipelines.
- One `git clone` for Raymond (or a contractor) to pick up the full surface area.
- Shared TypeScript types between `nemo-saas` and `nemo-workspace` (later).

**Pressures that argue for staying polyrepo:**

- **OpenClaw** and **Paperclip** are deeply tied to **local paths** on the Mac Mini (`~/.openclaw/`, etc.); vendoring them into the trunk does not by itself simplify deployment.
- **`autoagent`** has an **upstream** (`kevinrgu/autoagent`); subtree/submodule discipline must keep merges traceable.
- **Chrome extension** (`MKTG-Chrome-Extenstion`) ships through the Chrome Web Store with its own versioning cadence.
- **Blast radius:** one broken commit in a merged monorepo blocks everyone until fixed; polyrepo isolates that.

**Recommendation:** Treat monorepo consolidation as a ** gated program** (ADR + milestone), not a drive-by refactor. The first app in-tree (`apps/outbound-crm`) proves the trunk *can* carry code; the question is *which* siblings move next and when.

---

## 2. Scope: components in play

Per [`components.yaml`](../components.yaml), the Git-backed components today:

| id | repo | Merge candidacy (high-level) |
|----|------|------------------------------|
| `openclaw` | `sentientsprite/openclaw` | **Low early** — runtime + local installs; subtree only if release story is redesigned |
| `paperclip-workspace` | `sentientsprite/paperclip-workspace` | **Medium** — smaller; still local-path heavy |
| `nemo-workspace` | `sentientsprite/nemo-workspace` | **High** — dashboard + config; natural fit under `apps/dashboard` or `packages/dashboard` |
| `nemo-agent` | `sentientsprite/nemo-agent` | **Medium** — experimental; merge after evaluation concludes |
| `mktg-chrome-extension` | `sentientsprite/MKTG-Chrome-Extenstion` | **Low** — MV3 packaging + store releases often want their own root |
| `autoagent` | `sentientsprite/autoagent` | **High** — Harbor `tasks/`, `nemo-saas/`, harness already documented as Phase 4; matches `apps/` pattern |
| `pinchtab` | *(no repo yet)* | **N/A** — promote to repo before any subtree talk |

---

## 3. Structural target (illustrative)

If the program proceeds, a **plausible** layout (not prescriptive) is:

```text
NEMO-APP-v.1/
├── apps/
│   ├── outbound-crm/          # exists — Hunter → rep queue
│   ├── dashboard/             # candidate: subtree of nemo-workspace (rename in ADR)
│   └── extension/             # optional: subtree of MKTG-Chrome-Extension (if store flow allows)
├── packages/                  # optional: shared TS, eslint, types
│   └── prana-config/
└── legacy/                    # optional: git subtree `--prefix` homes that must keep upstream history
    ├── autoagent/             # candidate: full subtree with upstream remote = kevinrgu/autoagent OR sentientsprite/autoagent only
    └── openclaw/              # only if ADR accepts operational cost
```

Exact folder names should be chosen in an **ADR** when the first subtree is added.

---

## 4. Git subtree (mechanics + tradeoffs)

**Idea:** Vendor another repo’s history into a subdirectory of the trunk, with optional pull/push to a named remote.

**Add** (one-time, from trunk clone):

```bash
# Example ONLY — do not run unless an ADR approves.
git remote add autoagent-upstream https://github.com/sentientsprite/autoagent.git
git subtree add --prefix=apps/skill-eval autoagent-upstream main --squash
# or without --squash to retain full contributor history (larger trunk)
```

**Pull updates** from the satellite (after subtree exists):

```bash
git fetch autoagent-upstream
git subtree pull --prefix=apps/skill-eval autoagent-upstream main --squash
```

**Push** changes *back* to the satellite (rare; only if dual-home is intentional):

```bash
git subtree split --prefix=apps/skill-eval -b tmp-autoagent-export
git push autoagent-upstream tmp-autoagent-export:main
```

| Pros | Cons |
|------|------|
| Single clone; CI can run `pnpm -r test` across prefixes | History is heavy without `--squash`; with `--squash`, archeology is harder |
| Works with GitHub’s normal PR flow on the trunk | Conflicts on `subtree pull` can be painful; needs a merge owner |
| No submodule “forgot to init” foot-gun | **Upstream forks** (autoagent ← kevinrgu) need a documented remote naming policy |

**When subtree fits:** `autoagent`, possibly `nemo-workspace`, **after** a branch protection + CODEOWNERS story exists for `apps/*`.

---

## 5. npm / pnpm workspaces (without necessarily merging git history)

**Idea:** Keep separate Git repos **or** use subtree only for bringing sources in, then wire them with a **root `package.json`** + `pnpm-workspace.yaml` (or npm workspaces) at the trunk root.

Example **shape** (illustrative):

```yaml
# pnpm-workspace.yaml (at trunk root, future)
packages:
  - "apps/*"
  - "packages/*"
```

| Pros | Cons |
|------|------|
| One `pnpm install` / shared `typescript` / shared eslint | Root `package.json` in a doc-heavy trunk annoys contributors who only edit markdown |
| Internal packages can depend `@prana/outbound-crm` etc. | Vercel/Netlify need **per-app** root dirs (already documented for `outbound-crm`) |

**When workspaces fit:** After **two or more** deployable JS/TS apps live under `apps/`, or after `autoagent/nemo-saas` is colocated for shared types.

---

## 6. Git submodules (mention only)

Submodules pin a **commit** of another repo under a path. They are valid for **read-mostly** vendor code but are notorious for:

- “Forgot `git submodule update`” on clone
- Two-step PRs across repos

**Default recommendation:** **Avoid** submodules for Prana unless a legal/license boundary requires a hard separation. Prefer subtree or “fully merged history” with a tag.

---

## 7. Phased program (suggested, not scheduled)

| Phase | Gate | Action |
|-------|------|--------|
| **P0** | Outbound CRM MVP live | This trunk carries `apps/outbound-crm`; no other merges required |
| **P1** | ADR approved | Pick **one** pilot component (best: **`autoagent`** for `tasks/` + `nemo-saas/` alignment) |
| **P2** | Pilot subtree stable 30 days | Add **pnpm workspace** at trunk root if ≥2 TS apps; unify lint/typecheck |
| **P3** | `nemo-workspace` maturity | Subtree or greenfield `apps/dashboard` — only after dashboard deploy story is clear |
| **P4** | OpenClaw / Paperclip | Only if local-path installs are virtualized or install scripts are rewritten; else leave polyrepo |

Each phase should update [`components.yaml`](../components.yaml) and (if applicable) **retire** duplicate status reporting workflows so the trunk does not double-count components.

---

## 8. CI, ownership, and guardrails

Before **any** subtree lands:

1. **ADR** in `decisions/` — prefix path, remote names, squash vs full history, who owns `subtree pull`.
2. **CODEOWNERS** for `apps/*` and merged prefixes.
3. **GitHub Actions** — either one workflow with `paths:` filters per app, or **keep** per-component workflows until stable.
4. **Do not** delete satellite repos until **two release cycles** pass with subtree as SoT — keep the option to split if needed.

---

## 9. Relation to Phase 4 (Nemo SaaS)

[`MILESTONES.md`](../MILESTONES.md) gates Phase 4 productization. A monorepo is **orthogonal**: you can merge `autoagent`’s `nemo-saas/` earlier for **developer ergonomics** while still **not** shipping multi-tenant SaaS until `M-SEP-30`. The roadmap here is about **repository shape**, not **go-to-market**.

---

## 10. Next step

When Raymond (or delegate) is ready:

1. Open **`decisions/NNNN-monorepo-pilot.md`** naming the first subtree target and squash policy.
2. Run subtree **only** in a dedicated PR with two reviewers minimum.
3. Update this roadmap with **what actually shipped** (dates, prefixes, remotes).

Until then: **no subtree add, no workspace root in this repo, no deletion of component repos** — by design.
