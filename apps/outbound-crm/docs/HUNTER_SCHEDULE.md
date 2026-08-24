# Hunter → Outbound CRM

Leads land via `POST /api/webhooks/hunter`.

**ICP (current):** weak Maps + weak organic presence — businesses that are **not** Map Pack / branded-SERP winners. LSA detection is out of scope for now.

---

## Recommended now — **no Google Places / no billing**

Use committed fixtures (10 fictional **`555`** test businesses) + **two GitHub secrets**:

| Secret | Value |
|--------|--------|
| `OUTBOUND_CRM_WEBHOOK_URL` | `https://<your-outbound-crm>.vercel.app/api/webhooks/hunter` |
| `HUNTER_WEBHOOK_SECRET` | Same **Production** value as Vercel `HUNTER_WEBHOOK_SECRET` |

Workflow: **[`.github/workflows/outbound-crm-fixture-webhook.yml`](../../../.github/workflows/outbound-crm-fixture-webhook.yml)** — **Actions → Run workflow** (manual). Data file: **`apps/outbound-crm/scripts/fixtures/test-leads.json`**.

Locally (same secrets):

```bash
cd apps/outbound-crm
export OUTBOUND_CRM_WEBHOOK_URL="https://….vercel.app/api/webhooks/hunter"
export HUNTER_WEBHOOK_SECRET="…"
npm run seed:test-leads
```

### Deploy / migrate the **outbound-crm** Vercel project (second app)

Until this URL exists, GitHub has nowhere to POST.

1. **Vercel → Add Project →** import **`sentientsprite/NEMO-APP-v.1`**, **Root Directory** **`apps/outbound-crm`** (not repo root).
2. **Environment Variables → Production** — paste the **same Supabase** triple as before if you keep one DB (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), plus **`HUNTER_WEBHOOK_SECRET`** (generate with `openssl rand -hex 32`; store it in GitHub too).
3. **Deploy**. Smoke-test `GET /` or `/login` — should not be the customer-facing site.
4. Copy **Production deployment URL** into **`OUTBOUND_CRM_WEBHOOK_URL`** secret (full `/api/webhooks/hunter` path).

If **`nemo-app-v-1`** was mistakenly wired to **`apps/outbound-crm`**, switch that project to **`nemo-saas`** (customer site) or leave CRM-only on **`outbound-crm-*`** — see trunk **README** § customer vs internal.

---

## Weak-presence Leadfinder (Places + SERP organic)

### Inline button (`Run Hunter now` on `/queue`)

Uses [`lib/hunter-sync.ts`](../lib/hunter-sync.ts):

1. Places Text Search (trade + city queries)
2. Place Details
3. Optional SERP: `site:{domain}` + `"Business Name" City` via **Serper** (or SerpAPI)
4. Opportunity score (higher = weaker) → hard-skip strong winners (e.g. ≥150 reviews + website)
5. POST keepers with `source=hunter_weak_presence` and `profile.organic`

**Vercel env (outbound-crm):**

| Variable | Required | Notes |
|----------|----------|--------|
| `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` | Yes for live hunt | Places API |
| `HUNTER_WEBHOOK_SECRET` | Yes | Same as webhook auth |
| `OUTBOUND_CRM_PUBLIC_URL` | Recommended | Public CRM origin for self-POST |
| `SERPER_API_KEY` | For organic | [serper.dev](https://serper.dev) — preferred |
| `SERPAPI_API_KEY` | Optional | Fallback if Serper unset |

**SERP setup:** Create a Serper account → copy API key → set `SERPER_API_KEY` on Vercel → redeploy. (Google Custom Search JSON API is abandoned — closed to new GCP customers.)

Without a SERP key, Hunter still prefers weak Maps (no website / low reviews / missing hours) but skips `site:` / branded checks.

### SERP troubleshooting

If organic shows `skipped`:

1. Confirm `SERPER_API_KEY` (or `SERPAPI_API_KEY`) on **outbound-crm** Production
2. Redeploy so the runtime picks up the secret
3. **Run Hunter now** → expect `Organic: site≈N · branded: miss|hit` in notes

### GitHub Actions daily

Workflow: **[`.github/workflows/hunter-daily-outbound-crm.yml`](../../../.github/workflows/hunter-daily-outbound-crm.yml)**  
Script: **`scripts/hunter-daily-crm-sync.mjs`** — same weak-presence ranking; source `hunter_weak_presence_daily`.

Sync secrets with Vercel (`HUNTER_WEBHOOK_SECRET`, `OUTBOUND_CRM_WEBHOOK_URL`, Places + `SERPER_API_KEY`). After `gh auth login`:

```bash
gh secret set OUTBOUND_CRM_WEBHOOK_URL --body "https://outbound-crm-five.vercel.app/api/webhooks/hunter" -R sentientsprite/NEMO-APP-v.1
# HUNTER_WEBHOOK_SECRET / SERPER_API_KEY: paste same values as Vercel Production
gh secret set HUNTER_WEBHOOK_SECRET -R sentientsprite/NEMO-APP-v.1
gh secret set SERPER_API_KEY -R sentientsprite/NEMO-APP-v.1
```

Queries: **`scripts/hunter-search-queries.json`**.

Tunable env: `MAX_LEADS`, `STRONG_REVIEW_HARD_SKIP` (default 150 with SERP), `STRONG_REVIEW_HARD_SKIP_NO_CSE` (default 60 when organic skipped), `MIN_OPPORTUNITY` (default 35), `POOL_MULTIPLIER`.

**Maps-only mode (SERP unset or failing):** keepers require a **critical Maps gap** — no website, **&lt;15 reviews**, or missing hours. Mid-tier listings (website + 15–60+ reviews) are dropped until organic scoring works.

### OpenClaw Hunter vs Places script

The **OpenClaw gateway** is on GitHub (`sentientsprite/openclaw`), but Hunter’s **Maps/PinchTab** workflows usually live under **`~/.openclaw/`** on your Mac Mini. Align Mini POSTs to the same weak-presence ICP when possible.

**Optional snapshot from Mini:**

```bash
rsync -az --exclude '**/secrets/**' user@mini:~/.openclaw/workspace/ ./openclaw-workspace-snapshot/
```

Default cron: **14:15 UTC daily** — edit the workflow to pause until Places billing is on.

Leads use **`external_id`** `google_place:<place_id>`.

---

## OpenClaw Hunter only (Mac Mini)

1. Schedule Hunter (launchd / cron / Paperclip).
2. **POST** each lead (cap per day in agent logic) to `OUTBOUND_CRM_WEBHOOK_URL` with **`Authorization: Bearer HUNTER_WEBHOOK_SECRET`**.
3. Disable duplicate automation (Places cron and/or fixture workflow) if needed.

Webhook fields: **`README.md`** (Hunter webhook section). Prefer posting `profile` with website URL + organic fields when available.

---

## Operational checks

- Queue **`status=new`** shows new rows. Weak-presence runs use **`hunter_weak_presence`** / **`hunter_weak_presence_daily`**.
- Expect **low reviews / no website / thin site:** — not 4.8★ / thousands of reviews.
- **`503` / `401`** → wrong Vercel env or bearer secret.
- **`Missing GOOGLE_PLACES_API_KEY`** on **Hunter daily** workflow → expected until billing; use **fixture** workflow instead.
- CSE / SERP errors → see SERP troubleshooting above.

## Deferred (not blocking dialing / pSEO)

- **LSA detection** — SerpAPI/Serper local-ads fields later
- **Cold email** — Resend sandbox / no dedicated sending domain
- **Blind social auto-post** — use `content_drafts` + human approve (`POST /api/content-drafts/approve`)
