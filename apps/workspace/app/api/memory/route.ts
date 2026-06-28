import { NextResponse } from "next/server";

import { jsonError, parseJsonBody, parseSearchParams } from "@/lib/api/errors";
import { createMemoryBodySchema, memorySearchQuerySchema } from "@/lib/api/schemas";
import { importUrl } from "@/lib/ingest/url";
import { getMemoryStore } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(searchParams, memorySearchQuerySchema);
  if ("error" in parsed) return parsed.error;

  const store = getMemoryStore();
  await store.ensureReady();
  const results = await store.search(parsed.data.q, 10);
  const docs = await store.loadIndex();

  return NextResponse.json({ query: parsed.data.q, results, total: docs.length });
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, createMemoryBodySchema);
  if ("error" in parsed) return parsed.error;

  const { title: rawTitle, content, sourceType, sourceUrl } = parsed.data;
  const store = getMemoryStore();
  await store.ensureReady();

  try {
    if (sourceType === "url" && sourceUrl) {
      const imported = await importUrl(sourceUrl);
      const doc = await store.addDocument({
        title: rawTitle || imported.title,
        content: imported.content,
        sourceType: "url",
        sourceUrl: imported.url,
      });
      return NextResponse.json({ document: doc, import: { fetchedAt: imported.fetchedAt } });
    }

    const doc = await store.addDocument({
      title: rawTitle || "Note",
      content: content ?? "",
      sourceType,
    });

    return NextResponse.json({ document: doc });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Import failed", 400);
  }
}
