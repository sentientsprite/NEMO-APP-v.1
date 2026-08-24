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
  /** Structured Maps/GBP snapshot when Hunter Leadfinder stored one. */
  profile?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface OutboundActivity {
  id: string;
  lead_id: string;
  type:
    | "call_attempt"
    | "note"
    | "status_change"
    | "pre_call_report"
    | "audit_purchased"
    | "call_booked"
    | "retainer_signed";
  note: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

export const LADDER_EVENT_TYPES = ["audit_purchased", "call_booked", "retainer_signed"] as const;
export type LadderEventType = (typeof LADDER_EVENT_TYPES)[number];

export function isLadderEventType(s: string): s is LadderEventType {
  return (LADDER_EVENT_TYPES as readonly string[]).includes(s);
}
