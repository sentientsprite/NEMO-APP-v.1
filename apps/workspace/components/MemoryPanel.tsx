"use client";

import { useState } from "react";

type SourceType = "note" | "csv" | "url";

export function MemoryPanel({ initialTotal }: { initialTotal: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{
      document: { title: string; path: string; sourceType: SourceType; sourceUrl?: string };
      excerpt: string;
      score: number;
    }>
  >([]);
  const [sourceType, setSourceType] = useState<SourceType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [total, setTotal] = useState(initialTotal);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    const res = await fetch(`/api/memory?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setResults(data.results ?? []);
  }

  async function addDocument() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, sourceType, sourceUrl }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (res.ok) {
      setTitle("");
      setContent("");
      setSourceUrl("");
      setTotal((t) => t + 1);
      return;
    }

    setError(data.error ?? "Could not import document");
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Search memory ({total} docs)</h2>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indexed docs…"
            className="flex-1 rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2"
          />
          <button
            onClick={search}
            className="rounded-lg bg-nemo-accent px-4 py-2 text-sm font-medium text-[#0d1117]"
          >
            Search
          </button>
        </div>
        <ul className="space-y-3">
          {results.map((r, i) => (
            <li key={i} className="rounded-lg border border-nemo-border p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{r.document.title}</p>
                <span className="rounded-full border border-nemo-border px-2 py-0.5 text-xs uppercase text-nemo-muted">
                  {r.document.sourceType}
                </span>
              </div>
              <p className="text-xs text-nemo-muted">
                {r.document.sourceUrl ?? r.document.path}
              </p>
              <p className="mt-2 text-nemo-muted">{r.excerpt}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Import data</h2>
        <div>
          <label className="mb-2 block text-sm text-nemo-muted">Source type</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as SourceType)}
            className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2"
          >
            <option value="note">Note / markdown</option>
            <option value="csv">CSV</option>
            <option value="url">URL</option>
          </select>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={sourceType === "url" ? "Optional title" : "Document title"}
          className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2"
        />
        {sourceType === "url" ? (
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2"
          />
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            placeholder={
              sourceType === "csv"
                ? "Paste CSV rows here..."
                : "Paste notes, client info, research..."
            }
            className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2"
          />
        )}
        {error && <p className="text-sm text-nemo-danger">{error}</p>}
        <button
          onClick={addDocument}
          disabled={saving}
          className="rounded-lg bg-nemo-accent px-4 py-2 text-sm font-medium text-[#0d1117] disabled:opacity-50"
        >
          {saving ? "Importing..." : "Save & index"}
        </button>
      </section>
    </div>
  );
}
