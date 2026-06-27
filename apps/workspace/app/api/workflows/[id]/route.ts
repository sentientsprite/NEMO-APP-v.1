import { NextResponse } from "next/server";

import { summarizeWorkflow } from "@nemo/orchestrator";
import type { WorkflowRecord } from "@nemo/orchestrator";

import { loadWorkflow } from "@/lib/workflows";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const workflow = await loadWorkflow(id);
  if (!workflow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    summary: summarizeWorkflow(workflow),
    workflow,
  });
}
