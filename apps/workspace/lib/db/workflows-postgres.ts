import type { WorkflowRecord, AuditEntry } from "@nemo/orchestrator";

import { getAdminClient } from "@/lib/supabase/admin";

type WorkflowRow = {
  id: string;
  template_id: string;
  title: string;
  user_prompt: string;
  status: string;
  current_stage_index: number;
  record: WorkflowRecord;
  source_context: string | null;
  memory_context: string | null;
  created_at: string;
  updated_at: string;
};

function rowToRecord(row: WorkflowRow): WorkflowRecord {
  const record = row.record;
  return {
    ...record,
    id: row.id,
    templateId: record.templateId ?? (row.template_id as WorkflowRecord["templateId"]),
    title: row.title,
    userPrompt: row.user_prompt,
    status: row.status as WorkflowRecord["status"],
    currentStageIndex: row.current_stage_index,
    sourceContext: row.source_context ?? record.sourceContext,
    memoryContext: row.memory_context ?? record.memoryContext,
    createdAt: record.createdAt ?? row.created_at,
    updatedAt: row.updated_at,
  };
}

async function syncAuditEntries(workflowId: string, entries: AuditEntry[]): Promise<void> {
  const db = getAdminClient();
  if (!db || entries.length === 0) return;

  const { data: existing } = await db
    .from("nemo_audit_log")
    .select("at, action, detail")
    .eq("workflow_id", workflowId);

  const existingKeys = new Set(
    (existing ?? []).map((e) => `${e.at}|${e.action}|${e.detail ?? ""}`),
  );

  const toInsert = entries
    .filter((e) => !existingKeys.has(`${e.at}|${e.action}|${e.detail ?? ""}`))
    .map((e) => ({
      workflow_id: workflowId,
      at: e.at,
      action: e.action,
      detail: e.detail ?? null,
    }));

  if (toInsert.length > 0) {
    await db.from("nemo_audit_log").insert(toInsert);
  }
}

export async function saveWorkflowPostgres(workflow: WorkflowRecord): Promise<void> {
  const db = getAdminClient();
  if (!db) throw new Error("Postgres workflow store unavailable");

  const row = {
    id: workflow.id,
    template_id: workflow.templateId,
    title: workflow.title,
    user_prompt: workflow.userPrompt,
    status: workflow.status,
    current_stage_index: workflow.currentStageIndex,
    record: workflow,
    source_context: workflow.sourceContext ?? null,
    memory_context: workflow.memoryContext ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from("nemo_workflows").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);

  await syncAuditEntries(workflow.id, workflow.auditLog);
}

export async function loadWorkflowPostgres(id: string): Promise<WorkflowRecord | null> {
  const db = getAdminClient();
  if (!db) return null;

  const { data, error } = await db.from("nemo_workflows").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return rowToRecord(data as WorkflowRow);
}

export async function listWorkflowSummariesPostgres() {
  const db = getAdminClient();
  if (!db) return [];

  const { data, error } = await db
    .from("nemo_workflows")
    .select("id, title, status, template_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    templateId: row.template_id as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function listAuditLogPostgres(workflowId: string, limit = 50) {
  const db = getAdminClient();
  if (!db) return [];

  const { data, error } = await db
    .from("nemo_audit_log")
    .select("at, action, detail")
    .eq("workflow_id", workflowId)
    .order("at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}
