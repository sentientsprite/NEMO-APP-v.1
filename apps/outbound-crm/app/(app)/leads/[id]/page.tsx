import Link from "next/link";
import { notFound } from "next/navigation";

import { LeadWorkflow } from "@/components/LeadWorkflow";
import { createClient } from "@/lib/supabase/server";
import type { OutboundActivity, OutboundLead } from "@/lib/types";

export const maxDuration = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: lead, error } = await supabase.from("outbound_leads").select("*").eq("id", id).single();

  if (error || !lead) notFound();

  const row = lead as OutboundLead;

  const { data: activities } = await supabase
    .from("outbound_activities")
    .select("*")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });

  const log = (activities ?? []) as OutboundActivity[];

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/queue" className="text-indigo-600">
          ← Queue
        </Link>
      </p>
      <LeadWorkflow lead={row} activities={log} />
    </div>
  );
}
