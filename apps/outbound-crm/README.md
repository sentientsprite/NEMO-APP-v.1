# Prana — Outbound CRM (MVP)

Internal phone-closer CRM for **one sales rep** — **not** the customer-facing product site. Customer offerings ship on the **`nemo-app-v-1`** Vercel project; this app deploys on **`outbound-crm`** only. Leads land via **Hunter** HTTP webhook; the rep works a **queue + lead detail** UI with **`tel:`** click-to-call only (no telephony APIs). **Email is paused for v1** — optional **`mailto:`** links in the UI only; no SMTP/Resend/send.

- **Stack:** Next.js 15 (App Router), TypeScript, Tailwind, Supabase (Postgres + Auth + RLS).
- **Cost target:** Vercel Hobby + Supabase free tier (single project shared by rep + webhook).

## Repo location

This app lives under the Prana trunk:

`NEMO-APP-v.1/apps/outbound-crm/`

## Quickstart (local)

```bash
cd apps/outbound-crm
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_* , SUPABASE_SERVICE_ROLE_KEY , HUNTER_WEBHOOK_SECRET
npm install
npm run dev
# http://localhost:3010
```

## Supabase setup (from zero)

Full checklist: **`docs/SUPABASE_SETUP.md`** (new project, API keys, email Auth user with sign-ups off, Site URL for production, paste **`supabase/migrations/20260430000000_outbound_crm_init.sql`** in the SQL Editor).

Quick recap:

1. **Dashboard → Settings → API** — copy URL, **anon public**, **service_role**.
2. **Authentication → Users** — **Add user** for your roommate (email + password).
3. **SQL Editor** — run the migration file above (creates `outbound_leads`, `outbound_activities`, RLS).

### RLS model (justify)

- **`outbound_leads` / `outbound_activities`:** RLS allows **`authenticated`** role **full access** — single-tenant; only the rep signs in. There is no multi-org row filter.
- **Webhook:** `POST /api/webhooks/hunter` uses **`SUPABASE_SERVICE_ROLE_KEY`** server-side only — bypasses RLS to insert leads. Never expose this key to the browser.
- **Alternative (not implemented):** edge-only shared password with no Supabase Auth — weaker; Supabase Auth is preferred when already on Supabase.

## Environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase anon key (RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Webhook inserts; never commit |
| `HUNTER_WEBHOOK_SECRET` | Server only | `Authorization: Bearer …` on webhook |

## Vercel

Use the **internal** Vercel project (**`outbound-crm`** — e.g. `outbound-crm-*.vercel.app`), **not** **`nemo-app-v-1`** (that URL is for customer-facing products). Root directory for this repo: **`apps/outbound-crm`**.

Add **Settings → Environment Variables** on that project:

| Variable | Environment |
|----------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production (and Preview if you use it) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | Same — server-only, never expose to client |
| `HUNTER_WEBHOOK_SECRET` | Same |

Then trigger a **new deployment**.  

**Important:** `NEXT_PUBLIC_*` values are inlined at **`next build`**. After changing them on Vercel, redeploy so the runtime matches what was compiled.

Until URL + anon are present, **`/`** renders an in-app setup notice instead of crashing with “Application error”. The Hunter webhook returns **`503`** with JSON `server_misconfigured` if the service role key is missing.

## Hunter webhook

- **Method / path:** `POST /api/webhooks/hunter`
- **Auth:** `Authorization: Bearer <HUNTER_WEBHOOK_SECRET>` (constant-time compare on the server).
- **Body (JSON):**

```json
{
  "name": "Jane Doe",
  "phone": "8015550100",
  "source": "hunter_monday",
  "company": "ACME Landscaping",
  "email": "jane@example.com",
  "notes": "Qualified by Hunter scoring",
  "external_id": "openclaw-run-2026-04-30-abc123"
}
```

- **Required:** `name`, `phone`, `source`.
- **Optional:** `company`, `email`, `notes`, `external_id`.

### Dedupe rules

1. If **`external_id`** is present: **upsert** on `external_id` (one row per Hunter/OpenClaw run id).
2. If **`external_id`** is omitted: insert only if no row exists with the same **`phone_normalized`** and **case-insensitive trimmed `name`** among rows where `external_id` is null (matches partial unique index in migration). If duplicate, response is `200` with `{ "ok": true, "duplicate": true, "id": "<uuid>" }`.

### Phone normalization

- Stored `phone` is the raw input; `phone_normalized` is used for `tel:` and dedupe.
- **US-centric:** 10 digits → `+1…`; 11 digits starting with `1` → `+1…`; otherwise digits after optional leading `+`.

## Manual verification (curl + UI)

```bash
export URL=http://localhost:3010
export SECRET=your-hunter-secret

curl -sS -X POST "$URL/api/webhooks/hunter" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Lead","phone":"8015550100","source":"curl_test","company":"Test Co"}'
# expect: {"ok":true,"id":"...","deduped":false}

# Run again with same phone+name, no external_id → duplicate: true

# UI: sign in → Queue shows lead → open lead → Call now uses tel:
```

On **mobile Safari/Chrome**, tap **Call now** — OS dialer should open with E.164 `tel:`.

## Seed realistic test leads (Vercel + Supabase)

Use the Hunter webhook so you exercise **production** the same way OpenClaw/Hunter will later.

1. In Vercel (**outbound-crm** project), copy **Production** values: deployment URL and **`HUNTER_WEBHOOK_SECRET`** (Settings → Environment Variables — use “reveal”; never commit it).
2. From **`apps/outbound-crm`**:

```bash
export WEBHOOK_URL="https://YOUR-OUTBOUND-CRM.vercel.app/api/webhooks/hunter"
export HUNTER_WEBHOOK_SECRET="paste-production-secret-here"

npm run seed:test-leads
```

This posts **`scripts/fixtures/test-leads.json`** (10 fictional Utah-style prospects, **`external_id`** prefixed with `seed-prana-*`). Re-running **upserts** the same rows (no duplicate spam). Phones use **`555`** exchanges — safe test numbers.

Optional: `npm run seed:test-leads -- ./path/to/other.json` (path relative to current working directory).

Then sign in → **`/queue`** — default filter **new** should list them (raise **Limit** to 25 if needed).

## Deploy (Vercel)

1. Create or select project **`outbound-crm`** (separate from **`nemo-app-v-1`**). Import this repo; set **Root Directory** to `apps/outbound-crm`.
2. Add env vars (same as `.env.example`).
3. Redeploy. Webhook URL: `https://<outbound-crm-project>.vercel.app/api/webhooks/hunter`.

## Features (MVP)

| Feature | Notes |
|---------|------|
| Lead fields | name, company, phone, email, source, status, priority, notes, assigned_to, timestamps |
| Status enum | `new`, `contacted`, `no_answer`, `follow_up`, `qualified`, `meeting_booked`, `closed_won`, `closed_lost` |
| Activity log | `call_attempt`, `note`, `status_change` — append-only |
| Queue | Default: latest **new** leads (limit 10); filters: status, source, search, limit |
| Lead detail | Prominent **`tel:`**; **`mailto:`** if email; one-click voicemail log; status buttons; notes |

## Non-goals (v1)

- No Twilio / Vonage / SMS billing.
- No power dialer / auto-dial.
- No bulk email or server-sent outbound email.

## Optional follow-ups (documented only)

- **OpenClaw / Hunter:** POST directly to this webhook from a scheduled job or after Paperclip approval; no code change required here.
- **nemo-workspace:** could embed an iframe or deep-link to `/queue` for unified UX later.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (port **3010**) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |
