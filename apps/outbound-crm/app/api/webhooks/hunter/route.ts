import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseServiceConfigured } from "@/lib/supabase/env";
import { normalizePhone } from "@/lib/phone";
import { bearerMatchesSecret } from "@/lib/webhook-auth";

export const runtime = "nodejs";

interface HunterBody {
  name: string;
  company?: string;
  phone: string;
  email?: string;
  source: string;
  notes?: string;
  external_id?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(request: Request) {
  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      {
        error: "server_misconfigured",
        detail:
          "Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY on the server",
      },
      { status: 503 },
    );
  }

  const secret = process.env.HUNTER_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "server_misconfigured", detail: "HUNTER_WEBHOOK_SECRET not set" }, { status: 500 });
  }

  if (!bearerMatchesSecret(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const source = typeof body.source === "string" ? body.source.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
  const external_id = typeof body.external_id === "string" ? body.external_id.trim() : undefined;

  if (!name || !phone || !source) {
    return NextResponse.json({ error: "invalid_input", detail: "name, phone, and source are required" }, { status: 400 });
  }

  const phone_normalized = normalizePhone(phone);
  if (!phone_normalized) {
    return NextResponse.json({ error: "invalid_phone" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (external_id) {
    const row = {
      external_id,
      name,
      company: company ?? null,
      phone,
      phone_normalized,
      email: email ?? null,
      source,
      notes: notes ?? null,
    };

    const { data, error } = await admin
      .from("outbound_leads")
      .upsert(row, { onConflict: "external_id" })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id, deduped: "external_id" });
  }

  const { data: candidates, error: selErr } = await admin
    .from("outbound_leads")
    .select("id, name")
    .eq("phone_normalized", phone_normalized)
    .is("external_id", null);

  if (selErr) {
    return NextResponse.json({ error: "db_error", detail: selErr.message }, { status: 500 });
  }

  const nameNorm = name.toLowerCase().replace(/\s+/g, " ");
  const dup = candidates?.find((r) => r.name.toLowerCase().replace(/\s+/g, " ") === nameNorm);
  if (dup) {
    return NextResponse.json({ ok: true, duplicate: true, id: dup.id, deduped: "phone_name" });
  }

  const { data: created, error: insErr } = await admin
    .from("outbound_leads")
    .insert({
      name,
      company: company ?? null,
      phone,
      phone_normalized,
      email: email ?? null,
      source,
      notes: notes ?? null,
      external_id: null,
    })
    .select("id")
    .single();

  if (insErr) {
    return NextResponse.json({ error: "db_error", detail: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: created.id, deduped: false });
}
