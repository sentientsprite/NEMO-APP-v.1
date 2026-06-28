/**
 * Regression fixtures for URL research workflows.
 * Run: pnpm --filter @nemo/workspace eval:url-research
 */

export interface UrlResearchFixture {
  id: string;
  title: string;
  prompt: string;
  /** Text that must appear in gathered context when URL fetch succeeds */
  expectInContext?: string[];
  /** Hostnames that must be blocked */
  blockedUrls?: string[];
}

export const URL_RESEARCH_FIXTURES: UrlResearchFixture[] = [
  {
    id: "public-example",
    title: "https://example.com",
    prompt: "Summarize what this site is",
    expectInContext: ["Example Domain"],
  },
  {
    id: "private-localhost",
    title: "Research request",
    prompt: "Check http://127.0.0.1/admin",
    blockedUrls: ["http://127.0.0.1/admin"],
  },
  {
    id: "metadata-ip",
    title: "Blocked metadata",
    prompt: "Fetch http://169.254.169.254/latest/meta-data/",
    blockedUrls: ["http://169.254.169.254/latest/meta-data/"],
  },
  {
    id: "multi-url",
    title: "Compare sites",
    prompt: "Compare https://example.com and https://example.org",
    expectInContext: ["Example Domain"],
  },
];

export const SAMPLE_GATHERED_CONTEXT = `### Source: Example Domain (https://example.com)
_fetched 2026-01-01T00:00:00.000Z_
Example Domain This domain is for use in documentation examples without needing permission.`;
