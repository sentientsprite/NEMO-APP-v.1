# PIPELINE

Source of truth for every prospect Prana is actively working.
Updated by Raymond manually; component repos do not write here.

Sourced from [`BUSINESS_PLAN.md`](BUSINESS_PLAN.md) §3 (Active Pipeline)
and §3.2 (Best-fit add-ons per prospect). When a prospect changes stage,
move them between sections. Do not invent contact details or interaction
history — only record what the business plan or a real artifact in
another repo confirms.

---

## Stages

### Discovery (no contact yet)

_(empty — Hunter's Monday lead-discovery run will populate as new
prospects are scored. Per BUSINESS_PLAN §4 Outreach System, target is
10 new qualified prospects per week.)_

### Outreach Sent

- **Kris** — Monkey Wrench Plumbing — plumbing, 855 reviews, currently ranking #4 — best-fit add-ons: **Echo** (turn 855 reviews into a flywheel) + **Beacon** (close the rank #4 → #1 gap)
- **Kris** — CTR Heating & Air — HVAC, 382 reviews, 8 service areas — best-fit add-on: **Beacon** multi-location (8 locations × $79 = anchor product)
- **Daniel** — White Pine Dental — dental, 2 locations (Herriman undersold) — best-fit add-ons: **Beacon** (2 locations) + **Echo** (review velocity is the dental flywheel)

### Discovery Call Booked

_(empty)_

### Spark Audit Delivered

- **Nelson Jones Legal** — personal injury, West Jordan — audit delivered, outreach pending — best-fit add-ons: **Echo** (post-case review timing) + **Bloom** (high-CPC content moat)

### Paid (Spark / Flow / Prana tier)

_(empty — first paid client is M-APR-30, not yet hit)_

### Lost

_(empty)_

---

## Warm / pre-stage

Prospects without a stage yet because contact mode is direct (not LinkedIn outreach):

- **Carey** — SLC Landscaping — landscaping, multi-area coverage, spring-season urgency — Prana tier candidate — best-fit add-ons: **Beacon** (multi-area coverage) + **Bloom** (before/after seasonal content is the entire pitch) — _personal contact; first call/text is the M-APR-30 gating action_

When Carey moves to a real stage, promote into the kanban above.

---

## Stage definitions

- **Discovery** — Hunter has identified them; no contact yet
- **Outreach Sent** — message in their inbox; clock starts on follow-up
- **Discovery Call Booked** — calendar hold confirmed
- **Spark Audit Delivered** — $1,800 audit shipped; clock starts on Flow upsell at day 30
- **Paid** — Stripe charge cleared (annotate which tier)
- **Lost** — explicit no, or > 30 days stale post-outreach

## Phase 1 conversion target (per BUSINESS_PLAN §4)

20 personalized DMs by Apr 3 → 1 yes at 5% conversion rate. Currently
3 in `Outreach Sent` + 1 in `Spark Audit Delivered` + 1 in `Warm` = **5
prospects in motion**. Need ~15 more for the floor; Hunter's Monday
discovery run is the engine for that.

## Add-on candidate flags (cross-cut)

- **Beacon candidates** (multi-location or multi-service-area): Carey,
  CTR Heating (8 areas), White Pine Dental (2 locations)
- **Echo candidates** (steady review/job volume): Monkey Wrench (855
  reviews), White Pine Dental, Nelson Jones (post-case sensitive timing)
- **Bloom candidates** (visual or seasonal verticals): Carey
  (before/after = the pitch), Nelson Jones (high-CPC content moat)

---

## Reference

This file pairs with [`MILESTONES.md`](MILESTONES.md). Each prospect's
movement to `Paid` should reference the milestone it satisfies (e.g.
"Carey signed Prana → satisfies M-APR-30").
