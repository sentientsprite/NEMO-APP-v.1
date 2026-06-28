/**
 * URL research eval runner — no AI keys required.
 * Tests ingestion guards, URL extraction, and grounded demo output.
 */
import assert from "node:assert/strict";

import { groundedDemoOutput } from "../lib/ai/grounded-demo";
import {
  SAMPLE_GATHERED_CONTEXT,
  URL_RESEARCH_FIXTURES,
} from "./url-research.fixtures";
import {
  assertPublicUrl,
  extractUrls,
  gatherUrlContext,
  isPrivateHost,
} from "../lib/ingest/url";

let passed = 0;
let failed = 0;

function ok(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error instanceof Error ? error.message : error}`);
    }
  })();
}

async function main() {
  console.log("\nNEMO URL research evals\n");

  await ok("blocks localhost", () => {
    assert.equal(isPrivateHost("localhost"), true);
    assert.equal(isPrivateHost("127.0.0.1"), true);
  });

  await ok("blocks metadata IP", () => {
    assert.throws(() => assertPublicUrl(new URL("http://169.254.169.254/")));
  });

  await ok("extractUrls dedupes", () => {
    const urls = extractUrls("See https://example.com and https://example.com/.");
    assert.equal(urls.length, 2);
  });

  for (const fixture of URL_RESEARCH_FIXTURES) {
    if (fixture.blockedUrls?.length) {
      for (const url of fixture.blockedUrls) {
        await ok(`${fixture.id}: blocks ${url}`, () => {
          assert.throws(() => assertPublicUrl(new URL(url)));
        });
      }
    }
  }

  await ok("grounded demo cites fetched content", () => {
    const out = groundedDemoOutput({
      role: "researcher",
      workflowTitle: "https://example.com",
      userPrompt: "tell me everything",
      priorOutputs: {},
      memoryContext: SAMPLE_GATHERED_CONTEXT,
    });
    assert.ok(out);
    assert.match(out!.markdown, /Example Domain/i);
    assert.equal(out!.structured?.provider, "grounded_demo");
  });

  await ok("grounded demo does not invent without context", () => {
    const out = groundedDemoOutput({
      role: "researcher",
      workflowTitle: "https://example.com",
      userPrompt: "tell me everything",
      priorOutputs: {},
    });
    assert.equal(out, null);
  });

  const liveFixtures = URL_RESEARCH_FIXTURES.filter((f) => f.expectInContext?.length);
  if (process.env.NEMO_EVAL_LIVE_FETCH === "1") {
    console.log("\nLive fetch evals (NEMO_EVAL_LIVE_FETCH=1)\n");
    for (const fixture of liveFixtures) {
      await ok(`${fixture.id}: live gatherUrlContext`, async () => {
        const gathered = await gatherUrlContext(`${fixture.title}\n${fixture.prompt}`, {
          maxUrls: 2,
        });
        const blob = gathered.context.toLowerCase();
        for (const needle of fixture.expectInContext ?? []) {
          assert.match(blob, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
        }
      });
    }
  } else {
    console.log("\nSkipping live fetch evals (set NEMO_EVAL_LIVE_FETCH=1 to enable)\n");
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
