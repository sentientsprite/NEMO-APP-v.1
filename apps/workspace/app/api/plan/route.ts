import { NextResponse } from "next/server";

import { getAgentModeSummary } from "@/lib/ai/run-agent";
import { getPlan, planForClient } from "@/lib/plan";

export async function GET() {
  const plan = getPlan();
  const agent = getAgentModeSummary();

  return NextResponse.json({
    ...planForClient(plan),
    agent,
  });
}
