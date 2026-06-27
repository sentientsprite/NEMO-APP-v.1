import { WORKFLOW_TEMPLATES } from "@nemo/agents";

import { Header } from "@/components/Shell";
import { NewWorkflowForm } from "@/components/NewWorkflowForm";

export default async function NewWorkflowPage() {
  const templates = Object.values(WORKFLOW_TEMPLATES);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-2 text-2xl font-semibold">New workflow</h1>
        <p className="mb-8 text-nemo-muted">
          Pick a template. NEMO runs the factory behind simple stages — you only approve what matters.
        </p>
        <NewWorkflowForm templates={templates} />
      </main>
    </div>
  );
}
