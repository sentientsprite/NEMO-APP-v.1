import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export interface MemoryDocument {
  id: string;
  path: string;
  title: string;
  content: string;
  sourceType: "markdown" | "note" | "url" | "csv";
  sourceUrl?: string;
  indexedAt: string;
}

export interface MemorySearchResult {
  document: MemoryDocument;
  score: number;
  excerpt: string;
}

export class MemoryStore {
  constructor(private rootDir: string) {}

  async ensureReady(): Promise<void> {
    const dirs = [
      this.rootDir,
      path.join(this.rootDir, "memory"),
      path.join(this.rootDir, "references"),
      path.join(this.rootDir, "workflows"),
      path.join(this.rootDir, ".index"),
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    }
  }

  async loadIndex(): Promise<MemoryDocument[]> {
    const indexPath = path.join(this.rootDir, ".index", "documents.json");
    if (!existsSync(indexPath)) return [];
    const raw = await readFile(indexPath, "utf8");
    return JSON.parse(raw) as MemoryDocument[];
  }

  async saveIndex(documents: MemoryDocument[]): Promise<void> {
    const indexPath = path.join(this.rootDir, ".index", "documents.json");
    await writeFile(indexPath, JSON.stringify(documents, null, 2), "utf8");
  }

  async indexMarkdownFile(relPath: string, title?: string): Promise<MemoryDocument> {
    const fullPath = path.join(this.rootDir, relPath);
    const content = await readFile(fullPath, "utf8");
    const doc: MemoryDocument = {
      id: crypto.randomUUID(),
      path: relPath,
      title: title ?? path.basename(relPath),
      content,
      sourceType: "markdown",
      indexedAt: new Date().toISOString(),
    };
    const docs = await this.loadIndex();
    const filtered = docs.filter((d) => d.path !== relPath);
    filtered.push(doc);
    await this.saveIndex(filtered);
    return doc;
  }

  async addDocument(options: {
    title: string;
    content: string;
    sourceType: MemoryDocument["sourceType"];
    sourceUrl?: string;
  }): Promise<MemoryDocument> {
    await this.ensureReady();
    const title = options.title.trim() || "Untitled";
    const content = options.content.trim();
    if (!content) throw new Error("Content required");

    const safeName = title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    const extension = options.sourceType === "csv" ? "csv.md" : "md";
    const relPath = `memory/${safeName}-${Date.now()}.${extension}`;
    const fullPath = path.join(this.rootDir, relPath);
    const frontmatter = [
      "---",
      `source_type: ${options.sourceType}`,
      options.sourceUrl ? `source_url: ${options.sourceUrl}` : undefined,
      "---",
      "",
    ]
      .filter(Boolean)
      .join("\n");
    await writeFile(fullPath, `${frontmatter}# ${title}\n\n${content}\n`, "utf8");

    const doc: MemoryDocument = {
      id: crypto.randomUUID(),
      path: relPath,
      title,
      content,
      sourceType: options.sourceType,
      sourceUrl: options.sourceUrl,
      indexedAt: new Date().toISOString(),
    };
    const docs = await this.loadIndex();
    const filtered = docs.filter((d) => d.path !== relPath);
    filtered.push(doc);
    await this.saveIndex(filtered);
    return doc;
  }

  async addNote(title: string, content: string): Promise<MemoryDocument> {
    return this.addDocument({ title, content, sourceType: "note" });
  }

  async seedFromTemplate(templateDir: string): Promise<number> {
    await this.ensureReady();
    let count = 0;
    const files = ["MEMORY.md", "DNA.md", "TOKEN-EFFICIENCY.md", "AGENTS.md"];

    for (const file of files) {
      const src = path.join(templateDir, file);
      if (!existsSync(src)) continue;
      const dest = path.join(this.rootDir, file);
      const content = await readFile(src, "utf8");
      await writeFile(dest, content, "utf8");
      await this.indexMarkdownFile(file, file);
      count += 1;
    }

    const refsDir = path.join(templateDir, "references");
    if (existsSync(refsDir)) {
      const refFiles = await readdir(refsDir);
      for (const ref of refFiles) {
        if (!ref.endsWith(".md")) continue;
        const src = path.join(refsDir, ref);
        const destRel = `references/${ref}`;
        const dest = path.join(this.rootDir, destRel);
        const content = await readFile(src, "utf8");
        await writeFile(dest, content, "utf8");
        await this.indexMarkdownFile(destRel, ref);
        count += 1;
      }
    }

    return count;
  }

  async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
    const docs = await this.loadIndex();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const scored: MemorySearchResult[] = [];

    for (const doc of docs) {
      const haystack = `${doc.title}\n${doc.content}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) score += 1;
      }
      if (score === 0) continue;

      const idx = haystack.indexOf(terms[0]);
      const excerpt = doc.content.slice(Math.max(0, idx - 40), idx + 120).trim();

      scored.push({ document: doc, score, excerpt });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async getContextForPrompt(query: string): Promise<string> {
    const results = await this.search(query, 3);
    if (results.length === 0) return "";
    return results
      .map(
        (r) =>
          `### ${r.document.title} (${r.document.path})\n${r.excerpt}\n`,
      )
      .join("\n");
  }

  async saveWorkflow(id: string, data: unknown): Promise<void> {
    const file = path.join(this.rootDir, "workflows", `${id}.json`);
    await writeFile(file, JSON.stringify(data, null, 2), "utf8");
  }

  async loadWorkflow(id: string): Promise<unknown | null> {
    const file = path.join(this.rootDir, "workflows", `${id}.json`);
    if (!existsSync(file)) return null;
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  }

  async listWorkflowIds(): Promise<string[]> {
    const dir = path.join(this.rootDir, "workflows");
    if (!existsSync(dir)) return [];
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  }
}

export function defaultWorkspaceRoot(): string {
  return process.env.NEMO_WORKSPACE_ROOT ?? path.join(process.cwd(), ".nemo-workspace");
}
