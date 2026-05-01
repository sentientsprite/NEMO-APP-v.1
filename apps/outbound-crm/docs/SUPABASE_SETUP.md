# Supabase setup for Outbound CRM (from zero)

Do this **once** per Supabase project. After that, paste keys into **Vercel → Environment Variables** and **redeploy**.

## 1. Create the project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. Pick org, name, database password, region → **Create**.
3. Wait until the project is **healthy** (green).

## 2. Copy API keys for Vercel

1. **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **`anon` `public`** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **`service_role` `secret`** key → `SUPABASE_SERVICE_ROLE_KEY`  
     Treat **service_role** like a root password — never expose to the browser or commit it.

## 3. Auth (email login for your roommate)

1. **Authentication** → **Providers** → **Email** → enable (usually on by default).
2. **Authentication** → **Providers** → disable **“Allow new users to sign up”** / confirm **sign-ups disabled** (exact UI varies — goal: only you create users).
3. **Authentication** → **Users** → **Add user** (or **Invite**):
   - Set **email** + **password** for the rep.
   - Confirm the user appears in the list.

Optional but recommended for fewer surprises:

- **Authentication** → **URL configuration**  
  Add your production URL under **Site URL** (e.g. `https://nemo-app-v-1.vercel.app`) and **Redirect URLs** if you use magic links later.

## 4. Create tables + RLS (required)

The app expects **`outbound_leads`** and **`outbound_activities`**.

1. **SQL Editor** → **New query**.
2. Open this repo file and **paste the entire contents**:
   - `apps/outbound-crm/supabase/migrations/20260430000000_outbound_crm_init.sql`
3. Click **Run**.  
   You should see **Success** with no errors.

If you prefer CLI:

```bash
cd apps/outbound-crm
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

## 5. Webhook secret (Vercel only)

Generate a long random string locally:

```bash
openssl rand -hex 32
```

Put it in Vercel as **`HUNTER_WEBHOOK_SECRET`**. Hunter must send:

`Authorization: Bearer <that exact string>`

## 6. Vercel checklist (fixes most “still broken after I added vars” issues)

| Check | Detail |
|-------|--------|
| **Environment** | Vars attached to **Production** (not only Preview). |
| **Exact names** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `HUNTER_WEBHOOK_SECRET`. |
| **No smart quotes** | Paste plain ASCII quotes if you wrap values in `.env`. |
| **Redeploy** | Trigger a **new deployment** after saving env (required so `next build` sees `NEXT_PUBLIC_*`). |
| **Clear build cache** | If still stuck: Vercel → Deployment → **⋯** → **Redeploy** → enable **“Clear cache and redeploy”**. |

## 7. Smoke test after deploy

1. Open `/` — should redirect to `/login` or `/queue`, **not** “Application error”.
2. Sign in with the user you created in §3.
3. `/queue` — empty list is OK until Hunter POSTs.
4. Optional: `curl` the webhook (see main **README.md**).

---

If you still see an error page, it should now show the **real message** above the digest (see **`app/error.tsx`**). Use that message first when debugging.

### Login: `Unexpected token '<'` / “not valid JSON”

The browser asked Supabase for JSON but got an HTML page (almost always your Next site). **Cause:** `NEXT_PUBLIC_SUPABASE_URL` is wrong — often the **Vercel app URL** was pasted instead of **Supabase → Settings → API → Project URL** (`https://<ref>.supabase.co`). Fix the env var and **redeploy** so the client bundle picks it up.
