/**
 * Shown when NEXT_PUBLIC_SUPABASE_* are missing (typical fresh Vercel deploy).
 */
export function MissingSupabaseConfig() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-slate-800 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Configuration required</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Supabase environment variables</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          This app needs your Supabase project URL and keys before it can load. Add them in the Vercel project,
          then redeploy (or wait for the next deployment).
        </p>
        <ul className="mt-4 space-y-2 font-mono text-xs text-slate-800">
          <li>
            <code className="rounded bg-white px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code>
          </li>
          <li>
            <code className="rounded bg-white px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </li>
          <li>
            <code className="rounded bg-white px-1.5 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code>
            <span className="ml-2 font-sans text-slate-600">(server only — Hunter webhook + migrations)</span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          Find URL + anon + service role under{" "}
          <a
            href="https://supabase.com/dashboard/project/_/settings/api"
            className="font-medium text-indigo-600 underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Supabase → Project Settings → API
          </a>
          .
        </p>
        <p className="mt-3 text-sm text-slate-600">
          In Vercel:{" "}
          <strong className="font-medium text-slate-800">Project → Settings → Environment Variables</strong>, then add
          the three variables for <strong>Production</strong> (and Preview if you use it).
        </p>
      </div>
    </div>
  );
}
