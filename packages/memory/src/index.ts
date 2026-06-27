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

/**
 * Minimal key/value text store. Keys are forward-slash paths (e.g.
 * "index/documents.json", "workflows/<id>.json"). Backends: local filesystem
 * for desktop/dev, durable blob/object storage for serverless.
 */
export interface KvStore {
  getText(key: string): Promise<string | null>;
  putText(key: string, value: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
}

const INDEX_KEY = "index/documents.json";

export class FileKvStore implements KvStore {
  constructor(private rootDir: string) {}

  private resolve(key: string): string {
    return path.join(this.rootDir, key);
  }

  async getText(key: string): Promise<string | null> {
    const full = this.resolve(key);
    if (!existsSync(full)) return null;
    return readFile(full, "utf8");
  }

  async putText(key: string, value: string): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, value, "utf8");
  }

  async listKeys(prefix: string): Promise<string[]> {
    const dir = this.resolve(prefix);
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir);
    return entries.map((name) => `${prefix.replace(/\/$/, "")}/${name}`);
  }
}

export class MemoryStore {
  constructor(private kv: KvStore) {}

  async ensureReady(): Promise<void> {
    // Backends create paths lazily on write; nothing required up front.
  }

  async loadIndex(): Promise<MemoryDocument[]> {
    const raw = await this.kv.getText(INDEX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as MemoryDocument[];
    } catch {
      return [];
    }
  }

  async saveIndex(documents: MemoryDocument[]): Promise<void> {
    await this.kv.putText(INDEX_KEY, JSON.stringify(documents, null, 2));
  }

  private async upsert(doc: MemoryDocument): Promise<MemoryDocument> {
    const docs = await this.loadIndex();
    const filtered = docs.filter((d) => d.path !== doc.path);
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
    const title = options.title.trim() || "Untitled";
    const content = options.content.trim();
    if (!content) throw new Error("Content required");

    const safeName = title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
    const relPath = `memory/${safeName}-${Date.now()}.md`;

    const frontmatter = [
      "---",
      `source_type: ${options.sourceType}`,
      options.sourceUrl ? `source_url: ${options.sourceUrl}` : undefined,
      "---",
      "",
    ]
      .filter(Boolean)
      .join("\n");
    await this.kv.putText(relPath, `${frontmatter}# ${title}\n\n${content}\n`);

    return this.upsert({
      id: crypto.randomUUID(),
      path: relPath,
      title,
      content,
      sourceType: options.sourceType,
      sourceUrl: options.sourceUrl,
      indexedAt: new Date().toISOString(),
    });
  }

  async addNote(title: string, content: string): Promise<MemoryDocument> {
    return this.addDocument({ title, content, sourceType: "note" });
  }

  /**
   * Seed memory from a local template directory. Template files are read from
   * the filesystem (available in dev and in the deployment bundle); indexed
   * documents are written through the configured KvStore.
   */
  async seedFromTemplate(templateDir: string): Promise<number> {
    let count = 0;
    const files = ["MEMORY.md", "DNA.md", "TOKEN-EFFICIENCY.md", "AGENTS.md"];

    for (const file of files) {
      const src = path.join(templateDir, file);
      if (!existsSync(src)) continue;
      const content = await readFile(src, "utf8");
      await this.kv.putText(file, content);
      await this.upsert({
        id: crypto.randomUUID(),
        path: file,
        title: file,
        content,
        sourceType: "markdown",
        indexedAt: new Date().toISOString(),
      });
      count += 1;
    }

    const refsDir = path.join(templateDir, "references");
    if (existsSync(refsDir)) {
      const refFiles = await readdir(refsDir);
      for (const ref of refFiles) {
        if (!ref.endsWith(".md")) continue;
        const content = await readFile(path.join(refsDir, ref), "utf8");
        const destRel = `references/${ref}`;
        await this.kv.putText(destRel, content);
        await this.upsert({
          id: crypto.randomUUID(),
          path: destRel,
          title: ref,
          content,
          sourceType: "markdown",
          indexedAt: new Date().toISOString(),
        });
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
      .map((r) => `### ${r.document.title} (${r.document.path})\n${r.excerpt}\n`)
      .join("\n");
  }

  async saveWorkflow(id: string, data: unknown): Promise<void> {
    await this.kv.putText(`workflows/${id}.json`, JSON.stringify(data, null, 2));
  }

  async loadWorkflow(id: string): Promise<unknown | null> {
    const raw = await this.kv.getText(`workflows/${id}.json`);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async listWorkflowIds(): Promise<string[]> {
    const keys = await this.kv.listKeys("workflows/");
    return keys
      .filter((k) => k.endsWith(".json"))
      .map((k) => k.split("/").pop()!.replace(/\.json$/, ""));
  }
}

export function defaultWorkspaceRoot(): string {
  return process.env.NEMO_WORKSPACE_ROOT ?? path.join(process.cwd(), ".nemo-workspace");
}

/** Convenience factory for the local/desktop filesystem backend. */
export function createFileMemoryStore(rootDir = defaultWorkspaceRoot()): MemoryStore {
  return new MemoryStore(new FileKvStore(rootDir));
}
