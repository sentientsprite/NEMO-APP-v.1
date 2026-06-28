"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProviderBadge, StagePills, StatusBadge } from "./Shell";

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

export function WorkflowDetail(props: WorkflowDetailProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function runAction(action: "approve" | "reject" | "run") {
    setLoading(true);
    await fetch(`/api/workflows/${props.id}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(false);
    router.refresh();
  }

  const paywallStage = props.stages.find(
    (s) => s.output?.structured?.provider === "paywall_blocked",
  );

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
          <p className="font-medium text-nemo-warning">Needs your approval</p>
          <p className="mt-1 text-sm text-nemo-muted">
            Review the latest output below. Approve to continue or reject to stop.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              disabled={loading}
              onClick={() => runAction("approve")}
              className="rounded-lg bg-nemo-success px-4 py-2 text-sm font-medium text-[#0d1117]"
            >
              Approve
            </button>
            <button
              disabled={loading}
              onClick={() => runAction("reject")}
              className="rounded-lg border border-nemo-danger px-4 py-2 text-sm text-nemo-danger"
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
            {stage.output?.markdown && (
              <pre className="whitespace-pre-wrap text-sm text-nemo-muted">{stage.output.markdown}</pre>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
