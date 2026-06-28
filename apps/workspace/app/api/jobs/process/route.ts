import { NextResponse } from "next/server";

import { processWorkflowJobBatch, triggerJobProcessor } from "@/lib/jobs/process-workflow-job";
import { usePostgresWorkflows } from "@/lib/supabase/admin";

export const maxDuration = 60;

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!usePostgresWorkflows()) {
    return NextResponse.json({ error: "Job queue requires Postgres workflow store" }, { status: 503 });
  }
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workerId =
    request.headers.get("x-worker-id") ??
    `worker-${process.env.VERCEL_REGION ?? "local"}-${Date.now()}`;

  const result = await processWorkflowJobBatch({ workerId, maxJobs: 3, maxMs: 50_000 });

  if (result.processed > 0) {
    triggerJobProcessor();
  }

  return NextResponse.json(result);
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    queueEnabled: usePostgresWorkflows(),
    hint: "POST to process pending workflow jobs",
  });
}
