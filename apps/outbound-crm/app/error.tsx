"use client";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const hint =
    error.message.includes("NEXT_PUBLIC_SUPABASE") || error.message.includes("Missing")
      ? "This usually means Supabase URL/anon key were missing when Vercel ran next build, or they’re only set on Preview (not Production). Add both NEXT_PUBLIC_* vars under Production, then redeploy."
      : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-slate-900 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Application error</p>
        <h1 className="mt-2 text-xl font-semibold">{error.name ?? "Error"}</h1>
        <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm text-red-950">{error.message}</pre>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-red-800">
            Digest: <span>{error.digest}</span>
          </p>
        ) : null}
        {hint ? <p className="mt-4 text-sm leading-relaxed text-red-900">{hint}</p> : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
