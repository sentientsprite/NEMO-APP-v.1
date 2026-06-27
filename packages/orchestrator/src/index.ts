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
  };
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
    memoryContext,
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
