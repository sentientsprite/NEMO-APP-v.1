import { NextResponse } from "next/server";

import { WORKFLOW_TEMPLATES } from "@nemo/agents";
import {
  createWorkflow,
  runCurrentStageWithRunner,
  summarizeWorkflow,
} from "@nemo/orchestrator";
import type { WorkflowTemplateId } from "@nemo/agents";

import { runAgent } from "@/lib/ai/run-agent";
import { getMemoryStore } from "@/lib/store";
import { saveWorkflow } from "@/lib/workflows";

export async function GET() {
  const templates = Object.values(WORKFLOW_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    stages: t.stages,
    approvalGates: t.approvalGates,
  }));
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const body = await request.json();
  const templateId = body.templateId as WorkflowTemplateId;
  const title = String(body.title ?? "").trim();
  const userPrompt = String(body.prompt ?? "").trim();

  if (!templateId || !WORKFLOW_TEMPLATES[templateId]) {
    return NextResponse.json({ error: "Invalid template" }, { status: 400 });
  }
  if (!title || !userPrompt) {
    return NextResponse.json({ error: "Title and prompt required" }, { status: 400 });
  }

  const store = getMemoryStore();
  await store.ensureReady();
  const memoryContext = await store.getContextForPrompt(userPrompt);

  let workflow = createWorkflow(templateId, title, userPrompt);
  workflow = await runCurrentStageWithRunner(workflow, runAgent, memoryContext);
  await saveWorkflow(workflow);

  return NextResponse.json({
    workflow: summarizeWorkflow(workflow),
    full: workflow,
  });
}
