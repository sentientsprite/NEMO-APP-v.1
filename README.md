# NEMO-APP-v.1 — Prana Marketing Solutions trunk

> Canonical hub for **Prana Marketing Solutions**. The business plan in
> [`BUSINESS_PLAN.md`](BUSINESS_PLAN.md) is the source of truth. Every
> other repository in this org connects to and reports into this one.

This repo answers four questions:

1. **What is Prana?** → [`BUSINESS_PLAN.md`](BUSINESS_PLAN.md)
2. **Which repos run it?** → [`components.yaml`](components.yaml) +
   [Components](#components) below
3. **Is the system green right now?** → [`STATUS.md`](STATUS.md)
   (auto-updated by component reports)
4. **What's in flight this week?** → [`PIPELINE.md`](PIPELINE.md) +
   [`MILESTONES.md`](MILESTONES.md)

5. **Are component repos wired into STATUS.md?** → [`docs/TRUNK_LOOP_SETUP.md`](docs/TRUNK_LOOP_SETUP.md)

---

## Components

Mapped to [`BUSINESS_PLAN.md` §5 — Operations & Technology](BUSINESS_PLAN.md).

| Repo | Role per business plan | Status |
|---|---|---|
| [`openclaw`](https://github.com/sentientsprite/openclaw) | Agent runtime — 5 named agents (Aria, Hunter, Scout, Architect, Validator) running 24/7 on Mac Mini | reported nightly |
| [`paperclip-workspace`](https://github.com/sentientsprite/paperclip-workspace) | Orchestration — task scheduling, **PRANA-EXECUTE approval gate**, audit trail | reported nightly |
| [`nemo-workspace`](https://github.com/sentientsprite/nemo-workspace) | Prana Dashboard — pipeline visibility, prospects, revenue, agent activity, add-on performance | reported nightly |
| [`nemo-agent`](https://github.com/sentientsprite/nemo-agent) | Next-gen agent build (1.0) — being evaluated as successor to OpenClaw runtime | reported nightly |
| [`MKTG-Chrome-Extenstion`](https://github.com/sentientsprite/MKTG-Chrome-Extenstion) | In-browser Chrome companion — surfaces Beacon/Echo/Bloom signals while Raymond works inside Google tools | reported nightly |
| [`autoagent`](https://github.com/sentientsprite/autoagent) | SkillEval harness — Harbor regression tests for skill outputs; **Phase 4** Nemo SaaS productization track lives here | reported nightly |
| _PinchTab_ (local-only) | Browser automation — 800-token page extraction for prospect audits and GBP monitoring | not yet a repo |

`components.yaml` holds the machine-readable version of this table.
[`STATUS.md`](STATUS.md) holds the live status — last build, last agent
run, last deploy, last anomaly — pushed by each component.

---

## How "connect and report" works

Every component repo:

1. Has a `.prana/component.yaml` declaring its role and reporting cadence.
2. Has a README footer linking back here.
3. Runs a nightly GitHub Action ([`templates/report-to-prana.yml`](templates/report-to-prana.yml))
   that posts a structured status update as an Issue here, tagged
   `component-status`. The aggregator workflow rolls those into
   `STATUS.md` and closes them.

The full protocol is in [`CONTRIBUTING.md`](CONTRIBUTING.md). Templates
live under [`templates/`](templates/) — pasted as-is into each child repo
during onboarding.

---

## The 5 agents (per BUSINESS_PLAN §5)

Where each agent runs and where its config lives:

| Agent | Role | Runtime repo | Config / persona |
|---|---|---|---|
| **Aria** | CEO. Orchestrates all agents, owns client-facing approvals, consolidates weekly reports. | `openclaw` | `nemo-workspace/agents/aria/` |
| **Hunter** | Lead gen, outreach drafting, plus all add-on signal detection + content drafting (Beacon Monitor/Optimizer/Citation, Echo Trigger, Bloom Planner/Creator/Visual). | `openclaw` | `nemo-workspace/agents/hunter/` |
| **Scout** | R&D ingestion. Tools, competitors, market signals. | `openclaw` | `nemo-workspace/agents/scout/` |
| **Architect** | R&D synthesis. Turns Scout analysis into implementation blueprints. | `openclaw` | `nemo-workspace/agents/architect/` |
| **Validator** | R&D testing. Verifies Architect blueprints against the actual stack. | `openclaw` | `nemo-workspace/agents/validator/` |

Specialist roles (12 total across Beacon/Echo/Bloom) are sub-processes
inside Hunter or Aria; see BUSINESS_PLAN §5 for the full list.

---

## The 3 productized add-ons

Each add-on is a fixed-scope SKU defined in [`BUSINESS_PLAN.md` §2.2](BUSINESS_PLAN.md).
Status of productization is tracked in [`MILESTONES.md`](MILESTONES.md).

| Add-on | SKU | Launch milestone | Owning agents |
|---|---|---|---|
| **Beacon** — GBP Autopilot | $129/mo + $79/loc | May 15 | Hunter (Monitor, Optimizer, Citation), Aria (Review) |
| **Echo** — Review Flywheel | $89/mo | Jun 15 | Hunter (Trigger), Aria (Response, Amplifier) |
| **Bloom** — Seasonal Content Engine | $249/mo | Jul 15 | Hunter (Planner, Creator, Visual), Aria (Distributor, Performance) |

---

## Customer vs internal web apps (Vercel)

Keep **two Vercel projects** so customer traffic and internal tooling never share secrets or URLs:

| Vercel project | Audience | Purpose |
|----------------|----------|---------|
| **`nemo-app-v-1`** | **Customers** — products we sell | Marketing surfaces, signup flows, customer dashboards, anything buyer-facing. |
| **`outbound-crm`** | **Internal** — lead hunting / closer CRM | Rep queue, Hunter webhook, Supabase Auth for staff only. Code: **`apps/outbound-crm/`**. |

**Rules of thumb:** Import **`apps/outbound-crm`** only on **`outbound-crm`**. Do not repurpose **`nemo-app-v-1`** for the Hunter webhook or rep login. Each project carries its **own** env vars and deployments.

---

## Where decisions are recorded

| What | Where |
|---|---|
| Business strategy + pricing + ICP | [`BUSINESS_PLAN.md`](BUSINESS_PLAN.md) (this repo) |
| Cross-repo coordination protocol | [`CONTRIBUTING.md`](CONTRIBUTING.md) (this repo) |
| Active prospect pipeline | [`PIPELINE.md`](PIPELINE.md) (this repo) |
| Time-bound milestones | [`MILESTONES.md`](MILESTONES.md) (this repo) |
| Per-component code, build, runtime | The component's own repo |
| Per-component status snapshot | [`STATUS.md`](STATUS.md) (auto-updated here) |
| Architectural decisions (ADRs) | [`decisions/`](decisions/) (this repo) |

If you find yourself documenting strategy in a child repo, move it here.
If you find yourself documenting code internals here, move them to the
relevant component repo.

---

## Onboarding a new component repo

If you create or claim a new repo that should be part of Prana:

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
2. Copy [`templates/component.yaml.example`](templates/component.yaml.example)
   into the new repo as `.prana/component.yaml`.
3. Copy [`templates/report-to-prana.yml`](templates/report-to-prana.yml)
   into the new repo as `.github/workflows/report-to-prana.yml`.
4. Add the README footer from
   [`templates/child-readme-footer.md`](templates/child-readme-footer.md)
   to the new repo's `README.md`.
5. Add a row to [`components.yaml`](components.yaml) and to the
   Components table above. Open a PR here.

---

## Quickstart for Raymond

```bash
# Pull the trunk
git clone https://github.com/sentientsprite/NEMO-APP-v.1.git
cd NEMO-APP-v.1

# See what's green right now
cat STATUS.md

# See this week's prospect work
cat PIPELINE.md

# See what ships when
cat MILESTONES.md
```

Daily glance loop:

1. Open [`STATUS.md`](STATUS.md) — anything red?
2. Open [`PIPELINE.md`](PIPELINE.md) — who needs a follow-up today?
3. Open Aria's PRANA-EXECUTE queue (in `nemo-workspace`'s dashboard) —
   anything to approve?

That's it. The agents do the rest.
