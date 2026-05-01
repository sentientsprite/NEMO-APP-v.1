"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <div className="mx-auto flex max-w-lg flex-col justify-center px-4 py-12">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-800">Application error</p>
            <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm text-red-950">{error.message}</pre>
            {error.digest ? (
              <p className="mt-3 font-mono text-xs text-red-800">Digest: {error.digest}</p>
            ) : null}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
