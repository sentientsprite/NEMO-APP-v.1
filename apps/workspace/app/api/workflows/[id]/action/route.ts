import { NextResponse } from "next/server";

import {
  approveStageWithRunner,
  rejectStage,
  runCurrentStageWithRunner,
  summarizeWorkflow,
} from "@nemo/orchestrator";

import { runAgent } from "@/lib/ai/run-agent";
import { getMemoryStore } from "@/lib/store";
import { loadWorkflow, saveWorkflow } from "@/lib/workflows";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action as string;

  const store = getMemoryStore();
  let updated = workflow;

  try {
    if (action === "approve") {
      updated = await approveStageWithRunner(workflow, runAgent);
    } else if (action === "reject") {
      updated = rejectStage(workflow, body.reason);
    } else if (action === "run") {
      const memoryContext = await store.getContextForPrompt(workflow.userPrompt);
      updated = await runCurrentStageWithRunner(workflow, runAgent, memoryContext);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 400 },
    );
  }

  await saveWorkflow(updated);

  return NextResponse.json({
    summary: summarizeWorkflow(updated),
    workflow: updated,
  });
}
