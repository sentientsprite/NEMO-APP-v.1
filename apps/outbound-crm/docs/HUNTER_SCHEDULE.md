# Hunter → Outbound CRM

Leads land via `POST /api/webhooks/hunter`. **Google Places is optional** — skip it until you want GCP billing.

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

## Later — GitHub Actions + **Google Places** (needs GCP billing)

Workflow: **[`.github/workflows/hunter-daily-outbound-crm.yml`](../../../.github/workflows/hunter-daily-outbound-crm.yml)**  
Script: **`scripts/hunter-daily-crm-sync.mjs`** — Maps-style discovery + ranking. Requires **`GOOGLE_PLACES_API_KEY`** plus the two webhook secrets above.

Queries: **`scripts/hunter-search-queries.json`**. Tunable: **`MIN_USER_RATINGS_TOTAL`**, **`MIN_RATING`**, **`POOL_MULTIPLIER`**, **`MAX_LEADS`**.

### OpenClaw Hunter vs Places script

The **OpenClaw gateway** is on GitHub (`sentientsprite/openclaw`), but Hunter’s **Maps/PinchTab** workflows usually live under **`~/.openclaw/`** on your Mac Mini. This Places script mirrors **BUSINESS_PLAN.md** until the Mini POSTs webhooks directly.

**Optional snapshot from Mini:**

```bash
rsync -az --exclude '**/secrets/**' user@mini:~/.openclaw/workspace/ ./openclaw-workspace-snapshot/
```

Default cron: **14:15 UTC daily** — edit the workflow to pause until Places billing is on.

Leads from Places use **`external_id`** `google_place:<place_id>` and **`source`** `hunter_openclaw_aligned_daily`.

---

## OpenClaw Hunter only (Mac Mini)

1. Schedule Hunter (launchd / cron / Paperclip).
2. **POST** each lead (cap per day in agent logic) to `OUTBOUND_CRM_WEBHOOK_URL` with **`Authorization: Bearer HUNTER_WEBHOOK_SECRET`**.
3. Disable duplicate automation (Places cron and/or fixture workflow) if needed.

Webhook fields: **`README.md`** (Hunter webhook section).

---

## Operational checks

- Queue **`status=new`** shows new rows. Fixture seeds use **`source`** like `hunter_monday` / `hunter_csv_import`; Places runs use **`hunter_openclaw_aligned_daily`**.
- **`503` / `401`** → wrong Vercel env or bearer secret.
- **`Missing GOOGLE_PLACES_API_KEY`** on **Hunter daily** workflow → expected until billing; use **fixture** workflow instead.
