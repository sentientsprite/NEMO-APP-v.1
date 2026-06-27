import { NextResponse } from "next/server";

import { getMemoryStore, getTemplateDir } from "@/lib/store";
import { listWorkflowSummaries } from "@/lib/workflows";

export async function GET() {
  const store = getMemoryStore();
  await store.ensureReady();
  const workflows = await listWorkflowSummaries();
  const docs = await store.loadIndex();

  return NextResponse.json({
    workspaceRoot: process.env.NEMO_WORKSPACE_ROOT ?? ".nemo-workspace",
    documentCount: docs.length,
    workflows,
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
