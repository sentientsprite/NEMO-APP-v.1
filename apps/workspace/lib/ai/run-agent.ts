import { generateText } from "ai";

import {
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

  try {
    const result = await generateText({
      model,
      system: buildSystemPrompt(input),
      prompt: buildUserPrompt(input),
      maxOutputTokens: 1400,
      providerOptions: {
        gateway: {
          tags: [`nemo-role:${input.role}`, `nemo-tier:${modelTier}`],
        },
      },
    });

    return {
      role: input.role,
      markdown: result.text,
      structured: {
        provider: "vercel_ai_gateway",
        tier: plan.tier,
        model,
        modelTier,
        finishReason: result.finishReason,
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
  return {
    tier: plan.tier,
    label: plan.label,
    liveAi: plan.liveAi,
    strictAi: plan.strictAi,
    routing: getModelRoutingSummary(),
  };
}
