import path from "node:path";

import { FileKvStore, MemoryStore, defaultWorkspaceRoot } from "@nemo/memory";

import { BlobKvStore } from "./kv/blob";

let store: MemoryStore | null = null;

function useBlobStorage(): boolean {
  if (process.env.NEMO_STORAGE === "blob") return true;
  if (process.env.NEMO_STORAGE === "file") return false;
  // Default to durable blob storage on Vercel (read-only filesystem).
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL);
}

export function getMemoryStore(): MemoryStore {
  if (!store) {
    store = useBlobStorage()
      ? new MemoryStore(new BlobKvStore(process.env.BLOB_READ_WRITE_TOKEN))
      : new MemoryStore(new FileKvStore(defaultWorkspaceRoot()));
  }
  return store;
}

export function getTemplateDir(): string {
  return path.join(process.cwd(), "..", "..", "templates", "workspaces", "default");
}
