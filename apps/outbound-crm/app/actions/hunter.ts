"use server";

import { createClient } from "@/lib/supabase/server";
import { runHunterSyncInline } from "@/lib/hunter-sync";

export type HunterDispatchResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const DISPATCH_TIMEOUT_MS = 18_000;

/**
 * Rep-only: triggers Hunter lead intake.
 *
 * Order:
 * 1. Optional Make/n8n: `HUNTER_DISPATCH_WEBHOOK_URL`
 * 2. Optional GitHub Actions: `HUNTER_GITHUB_DISPATCH_TOKEN`
 * 3. **Inline (default):** Weak-presence Places Leadfinder (+ optional SERP via
 *    `SERPER_API_KEY`) when a Places key is set; otherwise upsert fixtures.
 */
export async function dispatchHunterLeadWorkflowAction(): Promise<HunterDispatchResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { ok: false, error: "Sign in required." };
  }

  const webhookUrl = process.env.HUNTER_DISPATCH_WEBHOOK_URL?.trim();
  const webhookSecret = process.env.HUNTER_DISPATCH_WEBHOOK_SECRET?.trim();

  if (webhookUrl) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "prana-outbound-crm/1.0",
      };
      if (webhookSecret) {
        headers.Authorization = `Bearer ${webhookSecret}`;
      }

      const res = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          source: "outbound_crm_button",
          triggeredByUserId: user.id,
          triggeredAt: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });

      if (res.ok) {
        return {
          ok: true,
          message:
            "Hunter automation accepted the request. Give it up to a minute, then refresh the queue.",
        };
      }

      const text = (await res.text()).slice(0, 400);
      return { ok: false, error: `Automation returned ${res.status}: ${text || "no body"}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `Could not reach automation webhook: ${msg}` };
    }
  }

  const ghToken = process.env.HUNTER_GITHUB_DISPATCH_TOKEN?.trim();
  if (ghToken) {
    const owner = process.env.HUNTER_GITHUB_REPO_OWNER?.trim() || "sentientsprite";
    const repo = process.env.HUNTER_GITHUB_REPO?.trim() || "NEMO-APP-v.1";
    const workflowFile =
      process.env.HUNTER_GITHUB_WORKFLOW_FILE?.trim() || "outbound-crm-fixture-webhook.yml";
    const ref = process.env.HUNTER_GITHUB_WORKFLOW_REF?.trim() || "main";

    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${ghToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "prana-outbound-crm",
        },
        body: JSON.stringify({ ref }),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });

      if (res.status === 204) {
        return {
          ok: true,
          message:
            "GitHub Actions workflow started. Wait 30–60s for jobs to POST to the Hunter webhook, then refresh.",
        };
      }

      const text = (await res.text()).slice(0, 400);
      let detail = text;
      try {
        const j = JSON.parse(text) as { message?: string };
        if (j.message) detail = j.message;
      } catch {
        /* ignore */
      }
      return { ok: false, error: `GitHub returned ${res.status}: ${detail}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `GitHub request failed: ${msg}` };
    }
  }

  // Default: run Leadfinder (Places) or fixtures inside this deployment.
  try {
    const result = await runHunterSyncInline(8);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, message: result.message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Inline Hunter sync failed: ${msg}` };
  }
}
