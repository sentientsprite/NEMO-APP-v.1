import {
  advanceWorkflowStageIndex,
  runSingleStageWithRunner,
  type WorkflowRecord,
} from "@nemo/orchestrator";

import { runAgent } from "@/lib/ai/run-agent";
import {
  claimNextWorkflowJob,
  completeWorkflowJob,
  enqueueWorkflowJob,
  failWorkflowJob,
} from "@/lib/db/jobs-postgres";
import { loadWorkflow, saveWorkflow } from "@/lib/workflows";

export async function processOneWorkflowJob(
  workerId: string,
): Promise<{ processed: boolean; workflowId?: string; error?: string }> {
  const job = await claimNextWorkflowJob(workerId);
  if (!job) return { processed: false };

  try {
    let workflow = await loadWorkflow(job.workflow_id);
    if (!workflow) throw new Error("Workflow not found");

    workflow = await runSingleStageWithRunner(workflow, runAgent);
    await saveWorkflow(workflow);

    workflow = afterStageJobPlanning(workflow);
    await saveWorkflow(workflow);

    if (shouldEnqueueFollowUp(workflow)) {
      await enqueueWorkflowJob(workflow.id);
    }

    await completeWorkflowJob(job.id);
    return { processed: true, workflowId: workflow.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed";
    await failWorkflowJob(job.id, message);
    return { processed: true, workflowId: job.workflow_id, error: message };
  }
}

function afterStageJobPlanning(workflow: WorkflowRecord): WorkflowRecord {
  if (workflow.status === "awaiting_approval") return workflow;
  if (workflow.status === "completed") return workflow;

  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status !== "completed") return workflow;

  return advanceWorkflowStageIndex(workflow);
}

function shouldEnqueueFollowUp(workflow: WorkflowRecord): boolean {
  if (workflow.status === "awaiting_approval") return false;
  if (workflow.status === "completed") return false;
  if (workflow.status === "rejected" || workflow.status === "failed") return false;
  return workflow.currentStageIndex < workflow.stages.length;
}

/** Fire-and-forget: kick the job processor (requires CRON_SECRET). */
export function triggerJobProcessor(): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;

  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEMO_APP_URL ?? "http://localhost:8420");

  void fetch(`${base}/api/jobs/process`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {});
}

/** Drain up to maxJobs within a time budget (for cron / manual process calls). */
export async function processWorkflowJobBatch(options: {
  workerId: string;
  maxJobs?: number;
  maxMs?: number;
}): Promise<{ processed: number; errors: string[] }> {
  const maxJobs = options.maxJobs ?? 5;
  const maxMs = options.maxMs ?? 25_000;
  const started = Date.now();
  let processed = 0;
  const errors: string[] = [];

  while (processed < maxJobs && Date.now() - started < maxMs) {
    const result = await processOneWorkflowJob(options.workerId);
    if (!result.processed) break;
    processed += 1;
    if (result.error) errors.push(result.error);
  }

  return { processed, errors };
}
