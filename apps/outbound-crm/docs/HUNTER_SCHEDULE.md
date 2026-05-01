# Hunter → Outbound CRM (daily leads)

You want **up to 10 new prospects per day** landing in the CRM queue via `POST /api/webhooks/hunter`.

Two supported setups:

---

## A) Cloud schedule — GitHub Actions + Google Places (this repo)

Workflow: **[`.github/workflows/hunter-daily-outbound-crm.yml`](../../../.github/workflows/hunter-daily-outbound-crm.yml)**  
Script: **[`scripts/hunter-daily-crm-sync.mjs`](../../../scripts/hunter-daily-crm-sync.mjs)** — Maps-style discovery, then **Golden Triangle–style ranking** (rating, review volume, website, Beacon/Echo-style boosts) before POSTing. Tunable env vars on the runner: **`MIN_USER_RATINGS_TOTAL`** (default 12), **`MIN_RATING`** (default 3.7), **`POOL_MULTIPLIER`** (default 5), **`MAX_LEADS`**.  
Queries: **[`scripts/hunter-search-queries.json`](../../../scripts/hunter-search-queries.json)**

### OpenClaw Hunter vs this script

The **OpenClaw gateway** is on GitHub (`sentientsprite/openclaw`), but **Hunter’s prompts, cron, and Maps/PinchTab workflows** usually live under **`~/.openclaw/`** on your Mac Mini (not in git). This Action mirrors **BUSINESS_PLAN.md** Hunter outcomes until the Mini POSTs the same webhook payloads.

**Optional:** snapshot configs from the Mini for review (not executed in CI):

```bash
rsync -az --exclude '**/secrets/**' user@mini:~/.openclaw/workspace/ ./openclaw-workspace-snapshot/
```

**Repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|--------|
| `GOOGLE_PLACES_API_KEY` | Google Cloud API key with **Places API** enabled (billing on). |
| `OUTBOUND_CRM_WEBHOOK_URL` | Full URL: `https://<your-outbound-crm>.vercel.app/api/webhooks/hunter` |
| `HUNTER_WEBHOOK_SECRET` | Exact **Production** `HUNTER_WEBHOOK_SECRET` from Vercel (same string the webhook checks). |

Default cron: **14:15 UTC daily** — change the `cron` line in the workflow if you want a different local time.

**Manual test:** Actions → **Hunter daily → Outbound CRM** → **Run workflow** (optional `max_leads`).

Leads use **`external_id`** `google_place:<place_id>` so the same business **upserts** instead of duplicating on reruns.

---

## B) Real OpenClaw Hunter (Mac Mini / `openclaw` runtime)

When Hunter already maps prospects and scores them:

1. On a **daily** schedule (launchd, cron, or Paperclip), run Hunter’s prospecting flow.
2. For **each** lead (cap **10/day** in your agent logic), `POST` JSON to the same webhook:

   `POST {{OUTBOUND_CRM_WEBHOOK_URL}}`  
   `Authorization: Bearer {{HUNTER_WEBHOOK_SECRET}}`  
   `Content-Type: application/json`

   Body fields: **`name`**, **`phone`**, **`source`**, optional **`company`**, **`email`**, **`notes`**, **`external_id`** (stable id from Hunter/OpenClaw run — required for safe dedupe).

3. Disable or pause the **GitHub Actions** workflow if it would double-fetch the same verticals.

Webhook semantics and examples: **`README.md`** in this app (Hunter webhook section).

---

## Operational checks

- CRM queue defaults to **`status=new`** — new webhook rows appear there after sync. Filter **Source** contains `hunter_openclaw_aligned_daily` to see only this job.
- **`503` / `401`** from webhook → Vercel env or bearer secret mismatch.
- Places script exits **1** if zero leads posted — often **`MIN_USER_RATINGS_TOTAL` / `MIN_RATING` too strict** for your market; lower them in the workflow `env` block for testing.
