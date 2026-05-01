# Prana — Outbound CRM (MVP)

Internal phone-closer CRM for **one sales rep**. Leads land via **Hunter** HTTP webhook; the rep works a **queue + lead detail** UI with **`tel:`** click-to-call only (no telephony APIs). **Email is paused for v1** — optional **`mailto:`** links in the UI only; no SMTP/Resend/send.

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

## Supabase setup

1. Create a [Supabase](https://supabase.com) project (free tier).
2. **Auth → Providers:** enable Email. **Disable sign-ups** (only the rep account exists — create the user under **Authentication → Users → Add user**, or invite the rep).
3. Run the SQL migration:
   - **SQL editor:** paste `supabase/migrations/20260430000000_outbound_crm_init.sql` and run, **or**
   - **CLI:** `cd apps/outbound-crm && supabase link --project-ref <ref> && supabase db push` (if you use the Supabase CLI).
4. Copy **Project URL**, **anon key**, and **service_role** key into `.env.local` (see `.env.example`).

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

## Deploy (Vercel)

1. Import the repo; set **Root Directory** to `apps/outbound-crm`.
2. Add env vars (same as `.env.example`).
3. Redeploy. Webhook URL: `https://<project>.vercel.app/api/webhooks/hunter`.

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
