export type AgentRole =
  | "researcher"
  | "story_writer"
  | "spec_writer"
  | "builder"
  | "test_verifier"
  | "validator";

export type UserStage = "understand" | "plan" | "approve" | "execute" | "verify" | "report";

export interface AgentDefinition {
  id: AgentRole;
  name: string;
  userStage: UserStage;
  description: string;
  tools: string[];
  restrictions: string[];
  requiresApprovalBefore?: boolean;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    id: "researcher",
    name: "Codebase Researcher",
    userStage: "understand",
    description: "Maps context, patterns, and risks before any building starts.",
    tools: ["read", "grep", "glob"],
    restrictions: ["read-only", "no assumptions without asking"],
  },
  {
    id: "story_writer",
    name: "Story Writer",
    userStage: "plan",
    description: "Turns a rough idea into a user story with acceptance criteria.",
    tools: ["read"],
    restrictions: ["no code", "no invented business rules"],
    requiresApprovalBefore: true,
  },
  {
    id: "spec_writer",
    name: "Spec Writer",
    userStage: "plan",
    description: "Turns an approved story into a technical brief.",
    tools: ["read", "grep", "glob"],
    restrictions: ["no file edits", "no skipped tenant or timezone concerns"],
    requiresApprovalBefore: true,
  },
  {
    id: "builder",
    name: "Builder",
    userStage: "execute",
    description: "Implements the approved brief in scoped folders.",
    tools: ["read", "edit", "write", "bash"],
    restrictions: ["scoped folders only", "must run checks before finishing"],
  },
  {
    id: "test_verifier",
    name: "Test Verifier",
    userStage: "verify",
    description: "Writes acceptance tests against the user story.",
    tools: ["read", "write-tests", "bash"],
    restrictions: ["test files only", "no patching production code"],
  },
  {
    id: "validator",
    name: "Implementation Validator",
    userStage: "report",
    description: "Compares implementation to story and brief; reports gaps honestly.",
    tools: ["read", "grep", "glob"],
    restrictions: ["read-only", "never fixes issues"],
  },
];

export const WORKFLOW_TEMPLATES = {
  research_business: {
    id: "research_business",
    name: "Research this business",
    description: "Research a company, draft a plan, get approvals, and produce a cited brief.",
    stages: ["researcher", "story_writer", "spec_writer", "builder", "validator"] as AgentRole[],
    approvalGates: ["story_writer", "spec_writer"] as AgentRole[],
  },
  analyze_documents: {
    id: "analyze_documents",
    name: "Analyze these documents",
    description: "Index uploaded notes and produce a summary with source citations.",
    stages: ["researcher", "story_writer", "builder", "validator"] as AgentRole[],
    approvalGates: ["story_writer"] as AgentRole[],
  },
  turn_notes_to_tasks: {
    id: "turn_notes_to_tasks",
    name: "Turn notes into tasks",
    description: "Extract actionable tasks from messy notes with clear acceptance criteria.",
    stages: ["researcher", "story_writer", "spec_writer", "builder"] as AgentRole[],
    approvalGates: ["story_writer", "spec_writer"] as AgentRole[],
  },
} as const;

export type WorkflowTemplateId = keyof typeof WORKFLOW_TEMPLATES;

export interface AgentRunInput {
  role: AgentRole;
  workflowTitle: string;
  userPrompt: string;
  priorOutputs: Record<string, unknown>;
  memoryContext?: string;
}

export interface AgentRunOutput {
  role: AgentRole;
  markdown: string;
  structured?: Record<string, unknown>;
  citations?: Array<{ source: string; excerpt: string }>;
}

export function getAgentDefinition(role: AgentRole): AgentDefinition {
  const def = AGENT_DEFINITIONS.find((a) => a.id === role);
  if (!def) throw new Error(`Unknown agent role: ${role}`);
  return def;
}

export function demoAgentOutput(input: AgentRunInput): AgentRunOutput {
  const { role, workflowTitle, userPrompt, priorOutputs } = input;

  switch (role) {
    case "researcher":
      return {
        role,
        markdown: `# Research findings\n\n**Topic:** ${workflowTitle}\n\n## Context gathered\n- User request: ${userPrompt}\n- Similar patterns: guided workflow with approval gates\n- Risks: unclear scope, missing source data, external actions without approval\n\n## Files / areas to touch\n- Workspace memory store\n- Workflow state machine\n- Dashboard approval UI\n\n## Open questions\n- What is the success metric for this workflow?\n- Are there external integrations required?\n`,
        structured: {
          risks: ["scope creep", "missing citations", "unsafe external actions"],
          patterns: ["approval gates", "structured JSON + markdown outputs"],
        },
        citations: [{ source: "user_input", excerpt: userPrompt.slice(0, 200) }],
      };

    case "story_writer":
      return {
        role,
        markdown: `# User story\n\nAs a **workspace operator**, I want **${workflowTitle}**, so that **I get a verified outcome without managing agents manually**.\n\n## Acceptance criteria\n1. Workflow shows Understand → Plan → Approve → Execute → Verify → Report stages.\n2. User can approve or reject at story and brief checkpoints.\n3. Final report lists what changed, what passed, and what risks remain.\n4. Important claims cite indexed memory or user input.\n\n## Out of scope\n- Live trading, wallet access, or unapproved external posts.\n\n## Open questions\n- ${priorOutputs.researcher ? "Research complete — confirm target audience." : "Run researcher first."}\n`,
        structured: {
          story: `As a workspace operator, I want ${workflowTitle}, so that I get a verified outcome.`,
          acceptanceCriteria: [
            "Approval gates at story and brief",
            "Structured final report",
            "Citations for factual claims",
          ],
        },
      };

    case "spec_writer":
      return {
        role,
        markdown:
          "# Technical brief\n\n## Data model\n- workflows table: id, template, status, stages, outputs\n- memory_documents table: path, content, citations\n\n## API\n- POST /api/workflows — start workflow\n- POST /api/workflows/:id/approve — approval gate\n- GET /api/memory/search — retrieval with citations\n\n## UI\n- Dashboard buckets: Needs approval, Running, Done, Risks found\n- Workflow detail timeline with stage outputs\n\n## Tests\n- Approval gate blocks builder until approved\n- Validator flags missing acceptance criteria\n",
        structured: {
          filesToChange: [
            "apps/workspace/app/page.tsx",
            "packages/orchestrator/src/runner.ts",
            "packages/memory/src/store.ts",
          ],
        },
      };

    case "builder":
      return {
        role,
        markdown: `# Build summary\n\nImplemented scoped changes for **${workflowTitle}**.\n\n## Files touched\n- Workflow runner with approval gates\n- Memory store with citation search\n- Dashboard with approval-centric layout\n\n## Reused patterns\n- nemo-workspace dashboard dark theme\n- Factory agent separation (read vs build vs validate)\n\n## Checks\n- Typecheck: pending local install\n- Demo mode works without API keys\n`,
        structured: {
          filesChanged: ["orchestrator", "memory", "workspace UI"],
          checks: ["demo mode", "approval gates"],
        },
      };

    case "test_verifier":
      return {
        role,
        markdown: `# Acceptance test report\n\n| Criterion | Status |\n|-----------|--------|\n| Approval gates | Covered |\n| Final report | Covered |\n| Citations | Partial — needs live memory fixtures |\n| External action blocking | Not covered in demo |\n`,
        structured: {
          passed: 2,
          failed: 0,
          partial: 2,
        },
      };

    case "validator":
      return {
        role,
        markdown: `# Validation report\n\n## Critical\n- None in demo mode.\n\n## Important\n- Add live LLM path when API key is configured.\n- Add vector search for large document sets.\n\n## Minor\n- Consider desktop packaging after web MVP stabilizes.\n\n## Clean areas\n- Agent role separation matches factory model.\n- User-facing stages hide agent complexity.\n`,
        structured: {
          critical: [],
          important: ["live LLM path", "vector search"],
          minor: ["desktop packaging"],
        },
      };
  }
}
