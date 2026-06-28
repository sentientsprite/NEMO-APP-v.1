"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProviderBadge, StagePills, StatusBadge } from "./Shell";
import { SafeMarkdown } from "./SafeMarkdown";

interface StageOutput {
  role: string;
  status: string;
  output?: {
    markdown?: string;
    structured?: { provider?: string; paywallUrl?: string };
  };
}

interface WorkflowDetailProps {
  id: string;
  title: string;
  status: string;
  userStage: string;
  userPrompt: string;
  stages: StageOutput[];
}

const STAGE_LABELS: Record<string, string> = {
  researcher: "research findings",
  story_writer: "user story",
  spec_writer: "technical brief",
  builder: "build output",
  validator: "validation report",
};

export function WorkflowDetail(props: WorkflowDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: "approve" | "reject" | "run") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${props.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  const paywallStage = props.stages.find(
    (s) => s.output?.structured?.provider === "paywall_blocked",
  );

  const awaitingStage = props.stages.find((s) => s.status === "awaiting_approval");
  const gateLabel = awaitingStage
    ? STAGE_LABELS[awaitingStage.role] ?? awaitingStage.role.replace(/_/g, " ")
    : null;
  const remainingGates = props.stages.filter(
    (s) => s.status === "awaiting_approval" || s.status === "pending",
  ).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{props.title}</h1>
          <p className="mt-2 text-nemo-muted">{props.userPrompt}</p>
        </div>
        <StatusBadge status={props.status} />
      </div>

      <StagePills active={props.userStage} />

      {paywallStage && (
        <div className="rounded-lg border border-nemo-danger bg-[#21262d] p-4">
          <p className="font-medium text-nemo-danger">Pro AI required</p>
          <p className="mt-1 text-sm text-nemo-muted">
            Live agents could not run on this deployment. Add AI Gateway credits or use the Live
            Demo tier for sourced excerpts.
          </p>
          {paywallStage.output?.structured?.paywallUrl && (
            <a
              href={paywallStage.output.structured.paywallUrl}
              className="mt-3 inline-block text-sm text-nemo-accent underline"
              target="_blank"
              rel="noreferrer"
            >
              Unlock Pro AI →
            </a>
          )}
        </div>
      )}

      {props.status === "awaiting_approval" && (
        <div className="rounded-lg border border-nemo-warning bg-[#21262d] p-4">
          <p className="font-medium text-nemo-warning">
            Checkpoint{gateLabel ? `: approve the ${gateLabel}` : ": needs your approval"}
          </p>
          <p className="mt-1 text-sm text-nemo-muted">
            Review the latest output below. Approve to continue or reject to stop.
            {remainingGates > 1
              ? " This workflow has more than one checkpoint, so you may be asked to approve again at the next stage."
              : ""}
          </p>
          {error && (
            <p className="mt-3 rounded-md border border-nemo-danger bg-[#2d1418] px-3 py-2 text-sm text-nemo-danger">
              {error}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={loading}
              onClick={() => runAction("approve")}
              className="rounded-lg bg-nemo-success px-4 py-2 text-sm font-medium text-[#0d1117] disabled:opacity-60"
            >
              {loading ? "Working…" : "Approve"}
            </button>
            <button
              disabled={loading}
              onClick={() => runAction("reject")}
              className="rounded-lg border border-nemo-danger px-4 py-2 text-sm text-nemo-danger disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {props.stages.map((stage) => (
          <section
            key={stage.role}
            className="rounded-lg border border-nemo-border bg-nemo-surface p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium capitalize">{stage.role.replace(/_/g, " ")}</h2>
              <div className="flex items-center gap-2">
                <ProviderBadge provider={stage.output?.structured?.provider} />
                <StatusBadge status={stage.status} />
              </div>
            </div>
            {stage.output?.markdown && <SafeMarkdown content={stage.output.markdown} />}
          </section>
        ))}
      </div>
    </div>
  );
}
