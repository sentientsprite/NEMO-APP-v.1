import { generateText, type GatewayModelId } from "ai";

import {
  type AgentRunInput,
  type AgentRunOutput,
  demoAgentOutput,
  getAgentDefinition,
} from "@nemo/agents";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6" satisfies GatewayModelId;

function liveModeEnabled(): boolean {
  if (process.env.NEMO_AI_MODE === "demo") return false;
  if (process.env.NEMO_AI_MODE === "live") return true;
  return Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);
}

function modelId(): GatewayModelId {
  return (process.env.NEMO_AI_MODEL ?? DEFAULT_MODEL) as GatewayModelId;
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

export async function runAgent(input: AgentRunInput): Promise<AgentRunOutput> {
  if (!liveModeEnabled()) {
    return {
      ...demoAgentOutput(input),
      structured: {
        ...demoAgentOutput(input).structured,
        provider: "demo",
      },
    };
  }

  try {
    const result = await generateText({
      model: modelId(),
      system: buildSystemPrompt(input),
      prompt: buildUserPrompt(input),
      maxOutputTokens: 1400,
    });

    return {
      role: input.role,
      markdown: result.text,
      structured: {
        provider: "vercel_ai_gateway",
        model: modelId(),
        finishReason: result.finishReason,
        usage: result.usage,
      },
      citations: input.memoryContext
        ? [{ source: "memory_context", excerpt: input.memoryContext.slice(0, 500) }]
        : [{ source: "user_input", excerpt: input.userPrompt.slice(0, 500) }],
    };
  } catch (error) {
    if (process.env.NEMO_AI_STRICT === "1") throw error;

    const fallback = demoAgentOutput(input);
    return {
      ...fallback,
      markdown: [
        `> Live model generation failed, so NEMO used demo mode for this stage.`,
        `> ${error instanceof Error ? error.message : "Unknown model error"}`,
        "",
        fallback.markdown,
      ].join("\n"),
      structured: {
        ...fallback.structured,
        provider: "demo_fallback",
        model: modelId(),
      },
    };
  }
}
