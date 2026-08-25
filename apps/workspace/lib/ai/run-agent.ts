import { generateText } from "ai";

import {
  type AgentRole,
  type AgentRunInput,
  type AgentRunOutput,
  getAgentDefinition,
} from "@nemo/agents";

import { demoOutputForPlan } from "@/lib/ai/grounded-demo";
import {
  getModelRoutingSummary,
  modelIdForRole,
  modelTierForRole,
} from "@/lib/ai/model-routing";
import { getPlan } from "@/lib/plan";

/** Researcher digests long URL/memory context — 1400 truncated Kimi to empty markdown. */
function maxOutputTokensForRole(role: AgentRole): number {
  if (role === "researcher") return 8192;
  // Builder compiles full reports; previously hit finishReason=length at 6144.
  if (role === "builder") return 12288;
  if (role === "spec_writer" || role === "story_writer") return 6144;
  if (role === "validator") return 6144;
  return 4096;
}

function formatPriorOutputs(priorOutputs: Record<string, unknown>): string {
  const entries = Object.entries(priorOutputs);
  if (entries.length === 0) return "No prior outputs yet.";

  return entries
    .map(([role, output]) => {
      const value = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      return `## ${role}\n${value}`;
    })
    .join("\n\n");
}

function buildSystemPrompt(input: AgentRunInput): string {
  const agent = getAgentDefinition(input.role);

  return [
    `You are ${agent.name} in NEMO Workspace.`,
    agent.description,
    "",
    "Follow these hard restrictions:",
    ...agent.restrictions.map((rule) => `- ${rule}`),
    "",
    "Write clear Markdown for a nontechnical workspace operator.",
    "Return only the stage output. Do not claim to have changed files unless this role is allowed to build.",
    "Cite user input or memory context when making factual claims.",
    "If source context is provided, base factual claims ONLY on that context — never invent site details.",
  ].join("\n");
}

function buildUserPrompt(input: AgentRunInput): string {
  return [
    `# Workflow title\n${input.workflowTitle}`,
    `# User request\n${input.userPrompt}`,
    `# Memory context\n${input.memoryContext || "No indexed memory matched this request."}`,
    `# Prior stage outputs\n${formatPriorOutputs(input.priorOutputs)}`,
  ].join("\n\n");
}

function paywallBlockedOutput(input: AgentRunInput, error: unknown): AgentRunOutput {
  const plan = getPlan();
  const message = error instanceof Error ? error.message : "AI Gateway unavailable";
  const link = plan.paywallUrl || "https://vercel.com/docs/ai-gateway";

  return {
    role: input.role,
    markdown: `# Pro AI required

> **Live agent output is unavailable on this deployment.**
>
> ${message}

## Unlock live AI
1. Add a payment method to your [Vercel AI Gateway](${link}) account (unlocks free credits).
2. Or deploy your own **Production** instance with \`NEMO_TIER=production\`.

*This stage did not run a model — no fabricated research was inserted.*`,
    structured: {
      provider: "paywall_blocked",
      error: message,
      paywallUrl: link,
    },
  };
}

function withProvider(output: AgentRunOutput, provider: string): AgentRunOutput {
  return {
    ...output,
    structured: { ...output.structured, provider },
  };
}

export async function runAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  const plan = getPlan();

  if (!plan.liveAi) {
    return withProvider(demoOutputForPlan(input), "grounded_demo");
  }

  const model = modelIdForRole(input.role);
  const modelTier = modelTierForRole(input.role);
  const system = buildSystemPrompt(input);
  const prompt = buildUserPrompt(input);

  async function generate(maxOutputTokens: number) {
    return generateText({
      model,
      system,
      prompt,
      maxOutputTokens,
      providerOptions: {
        gateway: {
          tags: [`nemo-role:${input.role}`, `nemo-tier:${modelTier}`],
        },
      },
    });
  }

  try {
    let maxOutputTokens = maxOutputTokensForRole(input.role);
    let result = await generate(maxOutputTokens);

    // Kimi has hit the old 1400 cap with finishReason=length and empty text.
    // Retry once with a higher budget before failing the stage.
    if (!result.text.trim() && result.finishReason === "length") {
      maxOutputTokens = Math.max(maxOutputTokens * 2, 12288);
      result = await generate(maxOutputTokens);
    }

    if (!result.text.trim()) {
      throw new Error(
        `Model returned empty markdown (finishReason=${result.finishReason}, maxOutputTokens=${maxOutputTokens})`,
      );
    }

    return {
      role: input.role,
      markdown: result.text,
      structured: {
        provider: "vercel_ai_gateway",
        tier: plan.tier,
        model,
        modelTier,
        finishReason: result.finishReason,
        maxOutputTokens,
        usage: result.usage,
      },
      citations: input.memoryContext
        ? [{ source: "memory_context", excerpt: input.memoryContext.slice(0, 500) }]
        : [{ source: "user_input", excerpt: input.userPrompt.slice(0, 500) }],
    };
  } catch (error) {
    if (plan.strictAi) throw error;

    if (!plan.allowDemoOutput) {
      return paywallBlockedOutput(input, error);
    }

    const fallback = demoOutputForPlan(input);
    return {
      ...fallback,
      markdown: [
        `> Live model generation failed; showing grounded demo output instead.`,
        `> ${error instanceof Error ? error.message : "Unknown model error"}`,
        "",
        fallback.markdown,
      ].join("\n"),
      structured: {
        ...fallback.structured,
        provider: "demo_fallback",
        tier: plan.tier,
        model,
        modelTier,
      },
    };
  }
}

/** Exposed for /api/plan and UI. */
export function getAgentModeSummary() {
  const plan = getPlan();
  const pagespeed = Boolean(
    process.env.GOOGLE_PAGESPEED_API_KEY?.trim() ||
      process.env.PAGESPEED_API_KEY?.trim() ||
      process.env.GOOGLE_MAPS_API_KEY?.trim(),
  );
  const places = Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim());

  return {
    tier: plan.tier,
    label: plan.label,
    liveAi: plan.liveAi,
    strictAi: plan.strictAi,
    routing: getModelRoutingSummary(),
    liveAudits: { pagespeed, places },
  };
}
