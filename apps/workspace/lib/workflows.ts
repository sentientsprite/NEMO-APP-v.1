import type { WorkflowRecord } from "@nemo/orchestrator";

import {
  listWorkflowSummariesPostgres,
  loadWorkflowPostgres,
  saveWorkflowPostgres,
} from "@/lib/db/workflows-postgres";
import { getMemoryStore } from "@/lib/store";
import { usePostgresWorkflows } from "@/lib/supabase/admin";

export async function loadWorkflow(id: string): Promise<WorkflowRecord | null> {
  if (usePostgresWorkflows()) {
    return loadWorkflowPostgres(id);
  }
  const store = getMemoryStore();
  const data = await store.loadWorkflow(id);
  return data as WorkflowRecord | null;
}

export async function saveWorkflow(workflow: WorkflowRecord): Promise<void> {
  if (usePostgresWorkflows()) {
    await saveWorkflowPostgres(workflow);
    return;
  }
  const store = getMemoryStore();
  await store.saveWorkflow(workflow.id, workflow);
}

export async function listWorkflowSummaries() {
  if (usePostgresWorkflows()) {
    return listWorkflowSummariesPostgres();
  }

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
