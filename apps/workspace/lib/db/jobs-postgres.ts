import { getAdminClient } from "@/lib/supabase/admin";

export type WorkflowJobStatus = "pending" | "running" | "completed" | "failed";

export interface WorkflowJob {
  id: string;
  workflow_id: string;
  job_type: "run_stage";
  status: WorkflowJobStatus;
  attempts: number;
  max_attempts: number;
  scheduled_at: string;
  last_error: string | null;
}

export async function enqueueWorkflowJob(workflowId: string): Promise<string | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db
    .from("nemo_workflow_jobs")
    .insert({
      workflow_id: workflowId,
      job_type: "run_stage",
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function claimNextWorkflowJob(workerId: string): Promise<WorkflowJob | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db.rpc("nemo_claim_workflow_job", {
    p_worker_id: workerId,
  });

  if (error) throw new Error(error.message);
  if (!data) return null;

  return data as WorkflowJob;
}

export async function completeWorkflowJob(jobId: string): Promise<void> {
  const db = getAdminClient();
  if (!db) return;

  const { error } = await db
    .from("nemo_workflow_jobs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}

export async function failWorkflowJob(jobId: string, message: string): Promise<void> {
  const db = getAdminClient();
  if (!db) return;

  const { data: job } = await db
    .from("nemo_workflow_jobs")
    .select("attempts, max_attempts")
    .eq("id", jobId)
    .single();

  const attempts = (job?.attempts as number) ?? 1;
  const maxAttempts = (job?.max_attempts as number) ?? 3;
  const status = attempts >= maxAttempts ? "failed" : "pending";

  const { error } = await db
    .from("nemo_workflow_jobs")
    .update({
      status,
      last_error: message,
      locked_at: null,
      locked_by: null,
      scheduled_at: new Date(Date.now() + 5000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) throw new Error(error.message);
}

export async function countPendingJobsForWorkflow(workflowId: string): Promise<number> {
  const db = getAdminClient();
  if (!db) return 0;

  const { count, error } = await db
    .from("nemo_workflow_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workflow_id", workflowId)
    .in("status", ["pending", "running"]);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
