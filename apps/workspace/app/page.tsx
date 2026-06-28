import Link from "next/link";

import { Header, PlanBanner, StatusBadge } from "@/components/Shell";
import { getPlan } from "@/lib/plan";
import { getMemoryStore } from "@/lib/store";
import { listWorkflowSummaries } from "@/lib/workflows";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const plan = getPlan();
  const store = getMemoryStore();
  await store.ensureReady();
  const workflows = await listWorkflowSummaries();
  const docs = await store.loadIndex();

  const buckets = {
    approval: workflows.filter((w) => w.status === "awaiting_approval"),
    running: workflows.filter((w) => w.status === "running" || w.status === "pending"),
    done: workflows.filter((w) => w.status === "completed"),
    risks: workflows.filter((w) => w.status === "failed" || w.status === "rejected"),
  };

  return (
    <div className="min-h-screen">
      <Header plan={plan} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <PlanBanner plan={plan} />
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Task Hub</h1>
            <p className="mt-2 text-nemo-muted">
              Understand → Plan → Approve → Execute → Verify → Report
            </p>
          </div>
          <Link
            href="/workflows/new"
            className="rounded-lg bg-nemo-accent px-4 py-2 font-medium text-[#0d1117]"
          >
            New workflow
          </Link>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Needs approval", count: buckets.approval.length, tone: "warning" },
            { label: "Running", count: buckets.running.length, tone: "accent" },
            { label: "Done", count: buckets.done.length, tone: "success" },
            { label: "Risks / stopped", count: buckets.risks.length, tone: "danger" },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-nemo-border bg-nemo-surface p-4"
            >
              <p className="text-sm text-nemo-muted">{card.label}</p>
              <p className="mt-2 text-3xl font-semibold">{card.count}</p>
            </div>
          ))}
        </div>

        <p className="mb-6 text-sm text-nemo-muted">
          Memory index: {docs.length} documents indexed
        </p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Recent workflows</h2>
          {workflows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-nemo-border p-8 text-center text-nemo-muted">
              No workflows yet.{" "}
              <Link href="/workflows/new" className="text-nemo-accent underline">
                Start one
              </Link>{' '}
              or seed the workspace from the Memory page.
            </div>
          ) : (
            workflows.map((wf) => (
              <Link
                key={wf.id}
                href={`/workflows/${wf.id}`}
                className="flex items-center justify-between rounded-lg border border-nemo-border bg-nemo-surface px-4 py-3 transition hover:border-nemo-accent"
              >
                <span>{wf.title}</span>
                <StatusBadge status={wf.status} />
              </Link>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
