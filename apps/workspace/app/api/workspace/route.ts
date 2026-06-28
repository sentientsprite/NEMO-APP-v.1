import { NextResponse } from "next/server";

import { getAgentModeSummary } from "@/lib/ai/run-agent";
import { getPlan, planForClient } from "@/lib/plan";
import { getMemoryStore, getTemplateDir } from "@/lib/store";
import { listWorkflowSummaries } from "@/lib/workflows";

export async function GET() {
  const plan = getPlan();
  const store = getMemoryStore();
  await store.ensureReady();
  const workflows = await listWorkflowSummaries();
  const docs = await store.loadIndex();

  return NextResponse.json({
    workspaceRoot: process.env.NEMO_WORKSPACE_ROOT ?? ".nemo-workspace",
    documentCount: docs.length,
    workflows,
    plan: planForClient(plan),
    agent: getAgentModeSummary(),
  });
}

export async function POST() {
  const store = getMemoryStore();
  await store.ensureReady();
  const count = await store.seedFromTemplate(getTemplateDir());
  const docs = await store.loadIndex();

  return NextResponse.json({
    seeded: count,
    documentCount: docs.length,
  });
}
