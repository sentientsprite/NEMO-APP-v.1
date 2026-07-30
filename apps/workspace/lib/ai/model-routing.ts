import type { AgentRole } from "@nemo/agents";
import type { GatewayModelId } from "ai";

export type ModelTier = "bulk" | "critical";

/** High-volume mechanical stages — Kimi K2.7 by default. */
const BULK_ROLES: ReadonlySet<AgentRole> = new Set([
  "researcher",
  "spec_writer",
  "builder",
  "test_verifier",
]);

/** Rare, high-stakes stages — Opus 4.8 by default. */
const CRITICAL_ROLES: ReadonlySet<AgentRole> = new Set(["story_writer", "validator"]);

const DEFAULT_BULK_MODEL = "moonshotai/kimi-k2.7-code" satisfies GatewayModelId;
const DEFAULT_CRITICAL_MODEL = "anthropic/claude-opus-4.8" satisfies GatewayModelId;
const LEGACY_SINGLE_MODEL = "anthropic/claude-sonnet-4.6" satisfies GatewayModelId;

function envModel(key: string): GatewayModelId | undefined {
  const value = process.env[key]?.trim();
  return value ? (value as GatewayModelId) : undefined;
}

/** True unless NEMO_AI_ROUTING=0 (single-model legacy mode). */
export function isModelRoutingEnabled(): boolean {
  return process.env.NEMO_AI_ROUTING !== "0";
}

export function modelTierForRole(role: AgentRole): ModelTier {
  if (CRITICAL_ROLES.has(role)) return "critical";
  if (BULK_ROLES.has(role)) return "bulk";
  return "bulk";
}

export function bulkModelId(): GatewayModelId {
  return envModel("NEMO_AI_MODEL_BULK") ?? DEFAULT_BULK_MODEL;
}

export function criticalModelId(): GatewayModelId {
  return envModel("NEMO_AI_MODEL_CRITICAL") ?? DEFAULT_CRITICAL_MODEL;
}

export function legacySingleModelId(): GatewayModelId {
  return envModel("NEMO_AI_MODEL") ?? LEGACY_SINGLE_MODEL;
}

export function modelIdForRole(role: AgentRole): GatewayModelId {
  if (!isModelRoutingEnabled()) {
    return legacySingleModelId();
  }

  return modelTierForRole(role) === "critical" ? criticalModelId() : bulkModelId();
}

const ALL_ROLES: AgentRole[] = [
  "researcher",
  "story_writer",
  "spec_writer",
  "builder",
  "test_verifier",
  "validator",
];

export function getModelRoutingSummary() {
  const routingEnabled = isModelRoutingEnabled();

  return {
    routingEnabled,
    bulkModel: routingEnabled ? bulkModelId() : legacySingleModelId(),
    criticalModel: routingEnabled ? criticalModelId() : legacySingleModelId(),
    legacySingleModel: legacySingleModelId(),
    roleMap: Object.fromEntries(
      ALL_ROLES.map((role) => [
        role,
        {
          tier: routingEnabled ? modelTierForRole(role) : "single",
          model: modelIdForRole(role),
        },
      ]),
    ) as Record<AgentRole, { tier: ModelTier | "single"; model: GatewayModelId }>,
  };
}
