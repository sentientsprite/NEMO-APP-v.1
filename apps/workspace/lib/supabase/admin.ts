import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getPublicSupabaseEnv, isSupabaseServiceConfigured, sanitizeEnv } from "./env";

export { isSupabaseServiceConfigured };

let admin: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  const { url } = getPublicSupabaseEnv();
  const service = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!isSupabaseServiceConfigured() || !url || !service) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getAdminClient(): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) return null;
  if (!admin) admin = createAdminClient();
  return admin;
}

export function usePostgresWorkflows(): boolean {
  if (process.env.NEMO_WORKFLOW_STORE === "postgres") return true;
  if (process.env.NEMO_WORKFLOW_STORE === "kv") return false;
  return isSupabaseServiceConfigured();
}
