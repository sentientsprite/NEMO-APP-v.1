import type { WorkflowRecord } from "@nemo/orchestrator";

import { getMemoryStore } from "./store";

export async function loadWorkflow(id: string): Promise<WorkflowRecord | null> {
  const store = getMemoryStore();
  const data = await store.loadWorkflow(id);
  return data as WorkflowRecord | null;
}

export async function saveWorkflow(workflow: WorkflowRecord): Promise<void> {
  const store = getMemoryStore();
  await store.saveWorkflow(workflow.id, workflow);
}

export async function listWorkflowSummaries() {
  const store = getMemoryStore();
  const ids = await store.listWorkflowIds();
  const summaries = [];

  for (const id of ids) {
    const wf = await loadWorkflow(id);
    if (!wf) continue;
    summaries.push({
      id: wf.id,
      title: wf.title,
      status: wf.status,
      templateId: wf.templateId,
      updatedAt: wf.updatedAt,
    });
  }

  return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
