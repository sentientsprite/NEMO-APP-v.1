import {
  type AgentRunInput,
  type AgentRunOutput,
  demoAgentOutput,
} from "@nemo/agents";

interface SourceBlock {
  title: string;
  url?: string;
  description?: string;
  body: string;
}

function excerpt(text: string, max = 900): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trim()}…`;
}

function parseSourceBlocks(context: string): SourceBlock[] {
  if (!context.trim()) return [];

  return context
    .split(/### Source: /)
    .filter(Boolean)
    .map((block) => {
      const lineBreak = block.indexOf("\n");
      const header = (lineBreak === -1 ? block : block.slice(0, lineBreak)).trim();
      const urlMatch = header.match(/\((https?:\/\/[^)]+)\)/);
      const title = header.replace(/\s*\([^)]+\)\s*$/, "").trim();
      const rest = lineBreak === -1 ? "" : block.slice(lineBreak + 1);

      const lines = rest.split("\n");
      let description: string | undefined;
      const bodyLines: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^_fetched .*_$/.test(trimmed)) continue;
        const summaryMatch = trimmed.match(/^_Summary:_\s*(.+)$/);
        if (summaryMatch) {
          description = summaryMatch[1].trim();
          continue;
        }
        bodyLines.push(line);
      }

      return {
        title,
        url: urlMatch?.[1],
        description,
        body: bodyLines.join("\n").trim(),
      };
    })
    .filter((s) => s.body.length > 0 || Boolean(s.description));
}

const JUNK_FRAGMENT = /^[^a-zA-Z0-9]*$|<[a-z]|\bpath d=|^[\d.\s]+$/i;

/** Pull readable sentence-like fragments, skipping leftover markup/SVG noise. */
function bulletsFromText(text: string, max = 5): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 24 && s.split(" ").length >= 4 && !JUNK_FRAGMENT.test(s))
    .slice(0, max);
}

/**
 * Demo output grounded in fetched URL / memory text. Uses real source content
 * instead of generic factory placeholders — honest for public live demos.
 */
export function groundedDemoOutput(input: AgentRunInput): AgentRunOutput | null {
  const context = input.memoryContext?.trim();
  if (!context) return null;

  const sources = parseSourceBlocks(context);
  const descriptions = sources.map((s) => s.description).filter(Boolean) as string[];
  const combined =
    sources.map((s) => [s.description, s.body].filter(Boolean).join("\n")).join("\n\n") ||
    context;
  const excerptText = excerpt(combined, 1200);
  const bodyBullets = bulletsFromText(combined);
  const bullets = bodyBullets.length > 0 ? bodyBullets : descriptions;
  const sourceList =
    sources.length > 0
      ? sources
          .map(
            (s) =>
              `- **${s.title}**${s.url ? ` (${s.url})` : ""}${
                s.description ? ` — ${s.description}` : ""
              }`,
          )
          .join("\n")
      : "- Indexed memory context";

  const demoNote =
    "\n\n---\n*Live Demo mode · summaries are extracted from fetched sources, not full AI reasoning. [Upgrade to Pro](/pricing) for live agents.*\n";

  switch (input.role) {
    case "researcher":
      return {
        role: input.role,
        markdown: `# Research findings

**Topic:** ${input.workflowTitle}

## Sources analyzed
${sourceList}

## Key excerpts (from fetched content)
${bullets.length > 0 ? bullets.map((b) => `- ${b}`).join("\n") : `- ${excerptText}`}

## User request
${input.userPrompt}

## Risks & gaps
- Demo mode cannot infer unstated business facts — only what appears in sources.
- Dynamic or login-gated pages may return incomplete text.
- External actions (posts, purchases) are blocked until approved.

## Open questions
- Which claims matter most for your decision?
- Are additional documents or URLs needed?${demoNote}`,
        structured: { provider: "grounded_demo", sourceCount: sources.length },
        citations: [{ source: "fetched_content", excerpt: excerptText.slice(0, 500) }],
      };

    case "story_writer":
      return {
        role: input.role,
        markdown: `# User story

As a **researcher**, I want **a cited brief on ${input.workflowTitle}**, so that **I can decide next steps from verified source text**.

## Acceptance criteria
1. Report cites fetched URL or memory excerpts for factual claims.
2. Unknowns are listed explicitly — nothing invented beyond sources.
3. Approval gates remain before any external action.

## Source basis
${excerptText.slice(0, 600)}${demoNote}`,
        structured: { provider: "grounded_demo" },
      };

    case "spec_writer":
      return {
        role: input.role,
        markdown: `# Research brief (demo)

## Deliverable
Structured summary of **${input.workflowTitle}** from indexed sources.

## Sections
- Executive summary (from excerpts)
- Products / services mentioned in source text
- Contact or location details if present in source
- Open questions requiring Pro AI or more documents

## Source material
${excerptText.slice(0, 800)}${demoNote}`,
        structured: { provider: "grounded_demo" },
      };

    case "builder":
      return {
        role: input.role,
        markdown: `# Analysis pack (demo)

No code changes in research workflows. Compiled source excerpts for **${input.workflowTitle}**.

## Included
- ${sources.length || 1} source block(s) indexed
- Excerpt length: ${combined.length} characters

## Sample content
${excerptText}${demoNote}`,
        structured: { provider: "grounded_demo" },
      };

    case "test_verifier":
      return {
        role: input.role,
        markdown: `# Verification (demo)

| Check | Status |
|-------|--------|
| URLs fetched | ${sources.length > 0 ? "Yes" : "Partial"} |
| Claims tied to source text | Yes |
| Live AI reasoning | Not in demo tier |${demoNote}`,
        structured: { provider: "grounded_demo" },
      };

    case "validator":
      return {
        role: input.role,
        markdown: `# Validation report (demo)

## Critical
- None — demo tier does not execute external actions.

## Important
- Outputs are **extractive summaries**, not full AI analysis.
- Upgrade to **Pro** for live agent reasoning via AI Gateway.

## Clean areas
- Source URLs were fetched and cited.
- No silent hallucination of site-specific facts beyond excerpts.${demoNote}`,
        structured: { provider: "grounded_demo" },
      };

    default:
      return null;
  }
}

/** Demo fixture, optionally grounded when source context exists. */
export function demoOutputForPlan(input: AgentRunInput): AgentRunOutput {
  return groundedDemoOutput(input) ?? demoAgentOutput(input);
}
