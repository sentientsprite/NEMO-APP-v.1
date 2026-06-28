import { NextResponse } from "next/server";

import { WORKFLOW_TEMPLATES } from "@nemo/agents";
import { createWorkflow, runCurrentStageWithRunner, summarizeWorkflow } from "@nemo/orchestrator";

import { parseJsonBody } from "@/lib/api/errors";
import { createWorkflowBodySchema } from "@/lib/api/schemas";
import { runAgent } from "@/lib/ai/run-agent";
import { enqueueWorkflowJob } from "@/lib/db/jobs-postgres";
import { gatherUrlContext } from "@/lib/ingest/url";
import { triggerJobProcessor } from "@/lib/jobs/process-workflow-job";
import { getMemoryStore } from "@/lib/store";
import { usePostgresWorkflows } from "@/lib/supabase/admin";
import { loadWorkflow, saveWorkflow } from "@/lib/workflows";

export async function GET() {
  const templates = Object.values(WORKFLOW_TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    stages: t.stages,
    approvalGates: t.approvalGates,
  }));
  return NextResponse.json({ templates, queueEnabled: usePostgresWorkflows() });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, createWorkflowBodySchema);
  if ("error" in parsed) return parsed.error;

  const { templateId, title, prompt: userPrompt } = parsed.data;

  const store = getMemoryStore();
  await store.ensureReady();
  const memoryContext = await store.getContextForPrompt(userPrompt);

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

  let workflow = createWorkflow(
    templateId,
    title,
    userPrompt,
    sourceContext,
    memoryContext || undefined,
  );

  if (usePostgresWorkflows()) {
    await saveWorkflow(workflow);
    await enqueueWorkflowJob(workflow.id);
    triggerJobProcessor();
    workflow = (await loadWorkflow(workflow.id)) ?? workflow;
  } else {
    workflow = await runCurrentStageWithRunner(workflow, runAgent);
    await saveWorkflow(workflow);
  }

  return NextResponse.json({
    workflow: summarizeWorkflow(workflow),
    full: workflow,
    queued: usePostgresWorkflows(),
    ingest: {
      fetched: gathered.imported.map((d) => ({
        url: d.url,
        title: d.title,
        fetchedAt: d.fetchedAt,
      })),
      failed: gathered.failed,
      notes: ingestNotes,
    },
  });
}
