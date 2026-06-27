import { NextResponse } from "next/server";

import { getMemoryStore } from "@/lib/store";

const MAX_IMPORT_CHARS = 80_000;

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("127.")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.")) return true;

  const match = host.match(/^172\.(\d+)\./);
  if (match) {
    const second = Number(match[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function importUrl(sourceUrl: string): Promise<{ title: string; content: string }> {
  const url = new URL(sourceUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http and https URLs are supported");
  }
  if (isPrivateHost(url.hostname)) {
    throw new Error("Private or local URLs are blocked for safety");
  }

  const res = await fetch(url, {
    headers: {
      "user-agent": "NEMO-Workspace/0.1 (+https://github.com/sentientsprite/NEMO-APP-v.1)",
    },
  });
  if (!res.ok) throw new Error(`URL returned ${res.status}`);

  const raw = (await res.text()).slice(0, MAX_IMPORT_CHARS);
  const contentType = res.headers.get("content-type") ?? "";
  const content = contentType.includes("html") ? htmlToText(raw) : raw;
  const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.trim() || url.hostname;

  return { title, content };
}

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
