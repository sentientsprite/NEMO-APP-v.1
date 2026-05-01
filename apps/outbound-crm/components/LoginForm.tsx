"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

function looksLikeHtmlJsonParseError(message: string): boolean {
  return (
    message.includes("<!DOCTYPE") ||
    message.includes("Unexpected token '<'") ||
    message.includes("is not valid JSON")
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signErr) {
        if (looksLikeHtmlJsonParseError(signErr.message)) {
          setError(
            "Sign-in is talking to the wrong server (got a web page instead of Supabase). In Vercel, set NEXT_PUBLIC_SUPABASE_URL to Supabase → Settings → API → Project URL (https://….supabase.co only), not your Vercel URL. Redeploy after saving."
          );
          return;
        }
        setError(signErr.message);
        return;
      }
      router.refresh();
      router.push("/queue");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (looksLikeHtmlJsonParseError(msg)) {
        setError(
          "Sign-in is talking to the wrong server (got a web page instead of Supabase). In Vercel, set NEXT_PUBLIC_SUPABASE_URL to Supabase → Settings → API → Project URL (https://….supabase.co only), not your Vercel URL. Redeploy after saving."
        );
      } else {
        setError(msg);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-12 max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-slate-900">Prana Outbound CRM</h1>
      <p className="text-sm text-slate-600">Sign in with the rep account (no public sign-up).</p>
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
