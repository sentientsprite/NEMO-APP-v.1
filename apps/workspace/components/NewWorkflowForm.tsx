"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Template {
  id: string;
  name: string;
  description: string;
}

export function NewWorkflowForm({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const normalizedUrl = url.trim()
      ? url.trim().match(/^https?:\/\//i)
        ? url.trim()
        : `https://${url.trim()}`
      : undefined;

    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId,
        title,
        prompt,
        ...(normalizedUrl ? { url: normalizedUrl } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to start workflow");
      return;
    }

    router.push(`/workflows/${data.workflow.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-nemo-muted">Template</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2 text-nemo-text"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-sm text-nemo-muted">
          {templates.find((t) => t.id === templateId)?.description}
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-nemo-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Research Green Valley Landscaping"
          className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2 text-nemo-text placeholder:text-nemo-muted"
          required
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-nemo-muted">
          Business website URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://superiorsealingutah.com"
          className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2 text-nemo-text placeholder:text-nemo-muted"
        />
        <p className="mt-2 text-sm text-nemo-muted">
          Optional. NEMO fetches this page first so research is grounded in real site content.
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-nemo-muted">What should NEMO do?</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="Describe the outcome you want. NEMO will research, plan, ask for approval, then execute."
          className="w-full rounded-lg border border-nemo-border bg-[#21262d] px-3 py-2 text-nemo-text placeholder:text-nemo-muted"
          required
        />
      </div>

      {error && <p className="text-sm text-nemo-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-nemo-accent px-4 py-2 font-medium text-[#0d1117] disabled:opacity-50"
      >
        {loading ? "Starting…" : "Start workflow"}
      </button>
    </form>
  );
}
