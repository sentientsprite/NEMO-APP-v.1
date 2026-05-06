"use server";

import { createClient } from "@/lib/supabase/server";

export type HunterDispatchResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const DISPATCH_TIMEOUT_MS = 18_000;

/**
 * Rep-only: triggers automation that eventually POSTs leads to /api/webhooks/hunter.
 *
 * Configure **one** path on the server:
 * - **Webhook (Make/n8n, etc.):** `HUNTER_DISPATCH_WEBHOOK_URL` plus optional
 *   `HUNTER_DISPATCH_WEBHOOK_SECRET` (sent as `Authorization: Bearer`). Your automation
 *   should call GitHub `workflow_dispatch` or run OpenClaw, then POST leads to this app.
 * - **GitHub API (direct):** `HUNTER_GITHUB_DISPATCH_TOKEN` (+ optional repo owner/name/file/ref env).
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
            "GitHub Actions workflow started. Wait 30–60s for jobs to POST fixtures to the Hunter webhook, then refresh.",
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

  return {
    ok: false,
    error:
      "Hunter is not wired from this deployment. Add HUNTER_DISPATCH_WEBHOOK_URL (automation) or HUNTER_GITHUB_DISPATCH_TOKEN (GitHub API) in Vercel → Environment Variables.",
  };
}
