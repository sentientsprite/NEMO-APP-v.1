import { getAgentModeSummary } from "@/lib/ai/run-agent";
import { listPlansFromPostgres } from "@/lib/db/plans-postgres";
import { getPlanAsync, planForClient } from "@/lib/plan";
import { isSupabaseServiceConfigured, usePostgresWorkflows } from "@/lib/supabase/admin";

export async function GET() {
  const plan = await getPlanAsync();
  const agent = getAgentModeSummary();

  let plansFromDb: Awaited<ReturnType<typeof listPlansFromPostgres>> = [];
  if (isSupabaseServiceConfigured()) {
    try {
      plansFromDb = await listPlansFromPostgres();
    } catch {
      plansFromDb = [];
    }
  }

  return Response.json({
    ...planForClient(plan),
    agent,
    plans: plansFromDb.map(planForClient),
    postgresEnabled: usePostgresWorkflows(),
  });
}
