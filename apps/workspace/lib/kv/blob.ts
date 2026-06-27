import { get, list, put } from "@vercel/blob";

import type { KvStore } from "@nemo/memory";

/**
 * Durable KvStore backed by Vercel Blob, for serverless deployments where the
 * filesystem is read-only. Keys map directly to blob pathnames.
 */
export class BlobKvStore implements KvStore {
  constructor(private token?: string) {}

  private common() {
    return this.token ? { token: this.token } : {};
  }

  async getText(key: string): Promise<string | null> {
    try {
      const res = await get(key, { access: "private", ...this.common() });
      if (!res || !res.stream) return null;
      return await new Response(res.stream as ReadableStream).text();
    } catch {
      return null;
    }
  }

  async putText(key: string, value: string): Promise<void> {
    await put(key, value, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      ...this.common(),
    });
  }

  async listKeys(prefix: string): Promise<string[]> {
    const { blobs } = await list({ prefix, ...this.common() });
    return blobs.map((b) => b.pathname);
  }
}
