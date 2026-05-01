export const LEAD_STATUSES = [
  "new",
  "contacted",
  "no_answer",
  "follow_up",
  "qualified",
  "meeting_booked",
  "closed_won",
  "closed_lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(s: string): s is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

/** Row shape from `outbound_leads` (matches migration). */
export interface OutboundLead {
  id: string;
  external_id: string | null;
  name: string;
  company: string | null;
  phone: string;
  phone_normalized: string;
  email: string | null;
  source: string | null;
  status: string;
  priority: number | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OutboundActivity {
  id: string;
  lead_id: string;
  type: "call_attempt" | "note" | "status_change";
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}
