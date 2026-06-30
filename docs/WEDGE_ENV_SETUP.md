# Wedge env setup — Spryte Site + Nemo Local

Wire production env vars so leads persist and GBP audits return real results.

**Supabase project (shared):** `bhedzgbrndsrnvwkmqbp`  
Dashboard: https://supabase.com/dashboard/project/bhedzgbrndsrnvwkmqbp/settings/api

---

## 1. Spryte Site (`spryte-site`)

**Symptom:** `{ ok: true, persisted: false }` on lead capture.

**Required (pick one path):**

### Path A — Supabase (preferred)

| Variable | Value |
|----------|--------|
| `SUPABASE_URL` | `https://bhedzgbrndsrnvwkmqbp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role secret from Supabase → Settings → API |

Table `public.audit_leads` already exists on this project.

### Path B — Outbound CRM webhook (fallback)

| Variable | Value |
|----------|--------|
| `LEAD_WEBHOOK_URL` | `https://outbound-crm-five.vercel.app/api/webhooks/hunter` |
| `LEAD_WEBHOOK_SECRET` | Same as `HUNTER_WEBHOOK_SECRET` on outbound-crm / nemo-app-v-1 |

Requires latest `apps/web/lib/leads.ts` (Bearer auth + `spryte_audit` payload).

---

## 2. Nemo Local (`nemo-app-v-1`)

**Symptoms:** Every audit shows C/75 “couldn't find GBP”; no PDF email.

| Variable | Where to get it |
|----------|-----------------|
| `GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) → enable **Places API (New)** → Credentials |
| `RESEND_API_KEY` | [Resend](https://resend.com/) → API Keys |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Nemo Local <reports@yourdomain.com>` |

Already set: Supabase triple, outbound CRM webhook, `LVS_INTERNAL_NOTIFY_EMAIL`.

---

## Quick wire script

From repo root, with secrets ready to paste:

```bash
./scripts/wire-wedge-env.sh
```

Then redeploy both projects (or push to trigger Vercel).

---

## Verify

```bash
# Spryte lead
curl -sS -X POST https://spryte-site.vercel.app/api/audit-lead \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","businessName":"Test Co","auditUrl":"https://example.com","overallScore":6.5}'

# Nemo Local audit
curl -sS -X POST https://nemo-app-v-1.vercel.app/api/lvs \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","businessName":"Joe'\''s Plumbing","zip":"80202"}'
```

Expect: Spryte `persisted: true`; Nemo `placeFound: true` in evidence (or real GBP insights), email received.
