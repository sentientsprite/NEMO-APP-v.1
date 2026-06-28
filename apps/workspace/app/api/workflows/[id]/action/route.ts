import { NextResponse } from "next/server";

import {
  approveStageWithRunner,
  finalizeStageApproval,
  rejectStage,
  runCurrentStageWithRunner,
  summarizeWorkflow,
} from "@nemo/orchestrator";

import { jsonError, parseJsonBody } from "@/lib/api/errors";
import { workflowActionBodySchema } from "@/lib/api/schemas";
import { runAgent } from "@/lib/ai/run-agent";
import { enqueueWorkflowJob } from "@/lib/db/jobs-postgres";
import { triggerJobProcessor } from "@/lib/jobs/process-workflow-job";
import { usePostgresWorkflows } from "@/lib/supabase/admin";
import { loadWorkflow, saveWorkflow } from "@/lib/workflows";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return jsonError("Not found", 404);
  }

  const parsed = await parseJsonBody(request, workflowActionBodySchema);
  if ("error" in parsed) return parsed.error;

  const { action, reason } = parsed.data;
  const queued = usePostgresWorkflows();
  let updated = workflow;

  try {
    if (action === "approve") {
      updated = queued
        ? finalizeStageApproval(workflow)
        : await approveStageWithRunner(workflow, runAgent);
    } else if (action === "reject") {
      updated = rejectStage(workflow, reason);
    } else if (action === "run") {
      if (queued) {
        await enqueueWorkflowJob(workflow.id);
        triggerJobProcessor();
        updated = (await loadWorkflow(workflow.id)) ?? workflow;
      } else {
        updated = await runCurrentStageWithRunner(workflow, runAgent);
      }
    }
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Action failed", 400);
  }

  if (!(queued && action === "run")) {
    await saveWorkflow(updated);
  }

  if (queued && action === "approve" && updated.status !== "completed") {
    await enqueueWorkflowJob(updated.id);
    triggerJobProcessor();
  }

  return NextResponse.json({
    summary: summarizeWorkflow(updated),
    workflow: updated,
    queued: queued && (action === "approve" || action === "run"),
  });
}
