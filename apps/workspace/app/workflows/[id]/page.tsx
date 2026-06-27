import { notFound } from "next/navigation";

import { Header } from "@/components/Shell";
import { WorkflowDetail } from "@/components/WorkflowDetail";
import { summarizeWorkflow } from "@nemo/orchestrator";

import { loadWorkflow } from "@/lib/workflows";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await loadWorkflow(id);
  if (!workflow) notFound();

  const summary = summarizeWorkflow(workflow);

  return (
    <div className="min-h-screen">
      <Header />
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
