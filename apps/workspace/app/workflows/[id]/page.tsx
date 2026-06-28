import { notFound } from "next/navigation";

import { Header } from "@/components/Shell";
import { WorkflowDetail } from "@/components/WorkflowDetail";
import { getPlan } from "@/lib/plan";
import { summarizeWorkflow } from "@nemo/orchestrator";

import { loadWorkflow } from "@/lib/workflows";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const plan = getPlan();
  const { id } = await params;
  const workflow = await loadWorkflow(id);
  if (!workflow) notFound();

  const summary = summarizeWorkflow(workflow);

  return (
    <div className="min-h-screen">
      <Header plan={plan} />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <WorkflowDetail
          id={workflow.id}
          title={workflow.title}
          status={workflow.status}
          userStage={summary.userStage}
          userPrompt={workflow.userPrompt}
          stages={workflow.stages}
        />
      </main>
    </div>
  );
}
