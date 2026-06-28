import { NextResponse } from "next/server";

import { WORKFLOW_TEMPLATES } from "@nemo/agents";
import {
  createWorkflow,
  runCurrentStageWithRunner,
  summarizeWorkflow,
} from "@nemo/orchestrator";
import type { WorkflowTemplateId } from "@nemo/agents";

import { runAgent } from "@/lib/ai/run-agent";
import { gatherUrlContext } from "@/lib/ingest/url";
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

  // Fetch any URLs in the title/prompt so agents reason over real page content
  // instead of guessing from the link. Best-effort; failures are surfaced, not fatal.
  const gathered = await gatherUrlContext(`${title}\n${userPrompt}`);
  const ingestNotes: string[] = [];

  for (const doc of gathered.imported) {
    try {
      await store.addDocument({
        title: doc.title,
        content: doc.content,
        sourceType: "url",
        sourceUrl: doc.url,
      });
    } catch {
      // Indexing is a convenience; the workflow still gets the content below.
    }
  }
  if (gathered.failed.length > 0) {
    ingestNotes.push(
      ...gathered.failed.map((f) => `Could not fetch ${f.url}: ${f.error}`),
    );
  }

  const sourceContext = gathered.context || undefined;

  let workflow = createWorkflow(templateId, title, userPrompt, sourceContext);
  workflow = await runCurrentStageWithRunner(workflow, runAgent, memoryContext);
  await saveWorkflow(workflow);

  return NextResponse.json({
    workflow: summarizeWorkflow(workflow),
    full: workflow,
    ingest: {
      fetched: gathered.imported.map((d) => ({ url: d.url, title: d.title })),
      failed: gathered.failed,
      notes: ingestNotes,
    },
  });
}
