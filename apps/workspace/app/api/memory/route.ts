import { NextResponse } from "next/server";

import { importUrl } from "@/lib/ingest/url";
import { getMemoryStore } from "@/lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const store = getMemoryStore();
  await store.ensureReady();
  const results = await store.search(q, 10);
  const docs = await store.loadIndex();

  return NextResponse.json({ query: q, results, total: docs.length });
}

export async function POST(request: Request) {
  const body = await request.json();
  const rawTitle = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const sourceType = String(body.sourceType ?? "note") as "note" | "csv" | "url";
  const sourceUrl = String(body.sourceUrl ?? "").trim();

  if (!["note", "csv", "url"].includes(sourceType)) {
    return NextResponse.json({ error: "Invalid source type" }, { status: 400 });
  }

  if (sourceType !== "url" && !content) {
    return NextResponse.json({ error: "Content required" }, { status: 400 });
  }

  const store = getMemoryStore();
  await store.ensureReady();

  try {
    if (sourceType === "url") {
      if (!sourceUrl) {
        return NextResponse.json({ error: "URL required" }, { status: 400 });
      }
      const imported = await importUrl(sourceUrl);
      const doc = await store.addDocument({
        title: rawTitle || imported.title,
        content: imported.content,
        sourceType: "url",
        sourceUrl,
      });
      return NextResponse.json({ document: doc });
    }

    const doc = await store.addDocument({
      title: rawTitle || "Note",
      content,
      sourceType,
    });

    return NextResponse.json({ document: doc });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 400 },
    );
  }
}
