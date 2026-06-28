import {
  type AgentRole,
  type AgentRunInput,
  type AgentRunOutput,
  type WorkflowTemplateId,
  WORKFLOW_TEMPLATES,
  demoAgentOutput,
  getAgentDefinition,
} from "@nemo/agents";

export type AgentRunner = (input: AgentRunInput) => Promise<AgentRunOutput>;

export type WorkflowStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "rejected";

export interface StageRecord {
  role: AgentRole;
  status: "pending" | "running" | "completed" | "awaiting_approval" | "skipped" | "failed";
  output?: AgentRunOutput;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowRecord {
  id: string;
  templateId: WorkflowTemplateId;
  title: string;
  userPrompt: string;
  status: WorkflowStatus;
  currentStageIndex: number;
  stages: StageRecord[];
  createdAt: string;
  updatedAt: string;
  auditLog: AuditEntry[];
  /**
   * Grounding context gathered once at creation (e.g. fetched URL page text).
   * Persisted on the record so every stage — including those reached after an
   * approval — sees the same source material.
   */
  sourceContext?: string;
  /** Memory search snapshot at workflow creation. */
  memoryContext?: string;
}

export interface AuditEntry {
  at: string;
  action: string;
  detail?: string;
}

export function createWorkflow(
  templateId: WorkflowTemplateId,
  title: string,
  userPrompt: string,
  sourceContext?: string,
  memoryContext?: string,
): WorkflowRecord {
  const template = WORKFLOW_TEMPLATES[templateId];
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    templateId,
    title,
    userPrompt,
    status: "pending",
    currentStageIndex: 0,
    stages: template.stages.map((role) => ({
      role,
      status: "pending",
    })),
    createdAt: now,
    updatedAt: now,
    auditLog: [{ at: now, action: "workflow_created", detail: templateId }],
    sourceContext: sourceContext?.trim() || undefined,
    memoryContext: memoryContext?.trim() || undefined,
  };
}

/** Merges persisted workflow context for agent stages. */
export function workflowContext(workflow: WorkflowRecord): string | undefined {
  const merged = [workflow.sourceContext, workflow.memoryContext]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
  return merged || undefined;
}

/** @deprecated use workflowContext */
function combinedContext(
  workflow: WorkflowRecord,
  memoryContext?: string,
): string | undefined {
  const merged = [workflow.sourceContext, workflow.memoryContext, memoryContext]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("\n\n");
  return merged || undefined;
}

function priorOutputs(workflow: WorkflowRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const stage of workflow.stages) {
    if (stage.output) out[stage.role] = stage.output.structured ?? stage.output.markdown;
  }
  return out;
}

export function getApprovalGateRole(workflow: WorkflowRecord): AgentRole | null {
  const template = WORKFLOW_TEMPLATES[workflow.templateId];
  const stage = workflow.stages[workflow.currentStageIndex];
  if (!stage || stage.status !== "awaiting_approval") return null;
  if (!template.approvalGates.includes(stage.role)) return null;
  return stage.role;
}

export function runCurrentStage(
  workflow: WorkflowRecord,
  memoryContext?: string,
): WorkflowRecord {
  const template = WORKFLOW_TEMPLATES[workflow.templateId];
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status === "completed") return workflow;

  const now = new Date().toISOString();
  const updated: WorkflowRecord = {
    ...workflow,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_started", detail: stage.role },
    ],
  };

  updated.stages = workflow.stages.map((s, i) =>
    i === idx ? { ...s, status: "running", startedAt: now } : s,
  );

  const input: AgentRunInput = {
    role: stage.role,
    workflowTitle: workflow.title,
    userPrompt: workflow.userPrompt,
    priorOutputs: priorOutputs(workflow),
    memoryContext,
  };

  const output = demoAgentOutput(input);
  const completedAt = new Date().toISOString();
  const needsApproval = template.approvalGates.includes(stage.role);

  updated.stages = updated.stages.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: needsApproval ? "awaiting_approval" : "completed",
          output,
          completedAt,
        }
      : s,
  );

  if (needsApproval) {
    updated.status = "awaiting_approval";
    updated.auditLog.push({
      at: completedAt,
      action: "approval_required",
      detail: stage.role,
    });
    return updated;
  }

  return advanceAfterStage(updated);
}

export function approveStage(workflow: WorkflowRecord): WorkflowRecord {
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status !== "awaiting_approval") {
    throw new Error("No stage awaiting approval");
  }

  const now = new Date().toISOString();
  const updated: WorkflowRecord = {
    ...workflow,
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_approved", detail: stage.role },
    ],
    stages: workflow.stages.map((s, i) =>
      i === idx ? { ...s, status: "completed" } : s,
    ),
  };

  return advanceAfterStage(updated);
}

export async function approveStageWithRunner(
  workflow: WorkflowRecord,
  runner: AgentRunner,
): Promise<WorkflowRecord> {
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status !== "awaiting_approval") {
    throw new Error("No stage awaiting approval");
  }

  const now = new Date().toISOString();
  const updated: WorkflowRecord = {
    ...workflow,
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_approved", detail: stage.role },
    ],
    stages: workflow.stages.map((s, i) =>
      i === idx ? { ...s, status: "completed" } : s,
    ),
  };

  return advanceAfterStageWithRunner(updated, runner);
}

export function rejectStage(workflow: WorkflowRecord, reason?: string): WorkflowRecord {
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  const now = new Date().toISOString();

  return {
    ...workflow,
    status: "rejected",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_rejected", detail: reason ?? stage?.role },
    ],
  };
}

function advanceAfterStage(workflow: WorkflowRecord): WorkflowRecord {
  const nextIndex = workflow.currentStageIndex + 1;
  const now = new Date().toISOString();

  if (nextIndex >= workflow.stages.length) {
    return {
      ...workflow,
      currentStageIndex: nextIndex - 1,
      status: "completed",
      updatedAt: now,
      auditLog: [
        ...workflow.auditLog,
        { at: now, action: "workflow_completed" },
      ],
    };
  }

  const advanced: WorkflowRecord = {
    ...workflow,
    currentStageIndex: nextIndex,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_advanced", detail: String(nextIndex) },
    ],
  };

  return runCurrentStage(advanced);
}

export async function runCurrentStageWithRunner(
  workflow: WorkflowRecord,
  runner: AgentRunner,
  memoryContext?: string,
): Promise<WorkflowRecord> {
  const template = WORKFLOW_TEMPLATES[workflow.templateId];
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status === "completed") return workflow;

  const now = new Date().toISOString();
  const updated: WorkflowRecord = {
    ...workflow,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_started", detail: stage.role },
    ],
  };

  updated.stages = workflow.stages.map((s, i) =>
    i === idx ? { ...s, status: "running", startedAt: now } : s,
  );

  const input: AgentRunInput = {
    role: stage.role,
    workflowTitle: workflow.title,
    userPrompt: workflow.userPrompt,
    priorOutputs: priorOutputs(workflow),
    memoryContext: workflowContext(workflow) ?? memoryContext,
  };

  const output = await runner(input);
  const completedAt = new Date().toISOString();
  const needsApproval = template.approvalGates.includes(stage.role);

  updated.stages = updated.stages.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: needsApproval ? "awaiting_approval" : "completed",
          output,
          completedAt,
        }
      : s,
  );

  if (needsApproval) {
    updated.status = "awaiting_approval";
    updated.auditLog.push({
      at: completedAt,
      action: "approval_required",
      detail: stage.role,
    });
    return updated;
  }

  return advanceAfterStageWithRunner(updated, runner);
}

/** Runs exactly one agent stage — does not auto-advance (for job queue). */
export async function runSingleStageWithRunner(
  workflow: WorkflowRecord,
  runner: AgentRunner,
  memoryContext?: string,
): Promise<WorkflowRecord> {
  const template = WORKFLOW_TEMPLATES[workflow.templateId];
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status === "completed") return workflow;

  const now = new Date().toISOString();
  const updated: WorkflowRecord = {
    ...workflow,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_started", detail: stage.role },
    ],
  };

  updated.stages = workflow.stages.map((s, i) =>
    i === idx ? { ...s, status: "running", startedAt: now } : s,
  );

  const input: AgentRunInput = {
    role: stage.role,
    workflowTitle: workflow.title,
    userPrompt: workflow.userPrompt,
    priorOutputs: priorOutputs(workflow),
    memoryContext: workflowContext(workflow) ?? memoryContext,
  };

  const output = await runner(input);
  const completedAt = new Date().toISOString();
  const needsApproval = template.approvalGates.includes(stage.role);

  updated.stages = updated.stages.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: needsApproval ? "awaiting_approval" : "completed",
          output,
          completedAt,
        }
      : s,
  );

  if (needsApproval) {
    updated.status = "awaiting_approval";
    updated.auditLog.push({
      at: completedAt,
      action: "approval_required",
      detail: stage.role,
    });
    return updated;
  }

  updated.status = "running";
  return updated;
}

/** Move to the next stage index after a stage completes without approval. */
export function advanceWorkflowStageIndex(workflow: WorkflowRecord): WorkflowRecord {
  const nextIndex = workflow.currentStageIndex + 1;
  const now = new Date().toISOString();

  if (nextIndex >= workflow.stages.length) {
    return {
      ...workflow,
      currentStageIndex: nextIndex - 1,
      status: "completed",
      updatedAt: now,
      auditLog: [
        ...workflow.auditLog,
        { at: now, action: "workflow_completed" },
      ],
    };
  }

  return {
    ...workflow,
    currentStageIndex: nextIndex,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_advanced", detail: String(nextIndex) },
    ],
  };
}

/** True when another run_stage job should be enqueued after the current stage. */
export function workflowNeedsNextStageJob(workflow: WorkflowRecord): boolean {
  if (workflow.status === "awaiting_approval") return false;
  if (workflow.status === "completed") return false;
  if (workflow.status === "rejected" || workflow.status === "failed") return false;

  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status !== "completed") return false;

  return idx + 1 < workflow.stages.length;
}

/** Approve the current gate and advance index — does not run agents (queue handles that). */
export function finalizeStageApproval(workflow: WorkflowRecord): WorkflowRecord {
  const idx = workflow.currentStageIndex;
  const stage = workflow.stages[idx];
  if (!stage || stage.status !== "awaiting_approval") {
    throw new Error("No stage awaiting approval");
  }

  const now = new Date().toISOString();
  const approved: WorkflowRecord = {
    ...workflow,
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_approved", detail: stage.role },
    ],
    stages: workflow.stages.map((s, i) =>
      i === idx ? { ...s, status: "completed" } : s,
    ),
  };

  return advanceWorkflowStageIndex(approved);
}

async function advanceAfterStageWithRunner(
  workflow: WorkflowRecord,
  runner: AgentRunner,
): Promise<WorkflowRecord> {
  const nextIndex = workflow.currentStageIndex + 1;
  const now = new Date().toISOString();

  if (nextIndex >= workflow.stages.length) {
    return {
      ...workflow,
      currentStageIndex: nextIndex - 1,
      status: "completed",
      updatedAt: now,
      auditLog: [
        ...workflow.auditLog,
        { at: now, action: "workflow_completed" },
      ],
    };
  }

  const advanced: WorkflowRecord = {
    ...workflow,
    currentStageIndex: nextIndex,
    status: "running",
    updatedAt: now,
    auditLog: [
      ...workflow.auditLog,
      { at: now, action: "stage_advanced", detail: String(nextIndex) },
    ],
  };

  return runCurrentStageWithRunner(advanced, runner);
}

export function userStageForWorkflow(workflow: WorkflowRecord): string {
  const stage = workflow.stages[workflow.currentStageIndex];
  if (!stage) return workflow.status === "completed" ? "report" : "understand";
  const def = getAgentDefinition(stage.role);
  if (workflow.status === "awaiting_approval") return "approve";
  if (workflow.status === "completed") return "report";
  return def.userStage;
}

export function summarizeWorkflow(workflow: WorkflowRecord) {
  return {
    id: workflow.id,
    title: workflow.title,
    templateId: workflow.templateId,
    status: workflow.status,
    userStage: userStageForWorkflow(workflow),
    currentAgent: workflow.stages[workflow.currentStageIndex]?.role,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
  };
}
