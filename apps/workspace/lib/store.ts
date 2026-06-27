import path from "node:path";

import { MemoryStore, defaultWorkspaceRoot } from "@nemo/memory";

let store: MemoryStore | null = null;

export function getMemoryStore(): MemoryStore {
  if (!store) {
    store = new MemoryStore(defaultWorkspaceRoot());
  }
  return store;
}

export function getTemplateDir(): string {
  return path.join(process.cwd(), "..", "..", "templates", "workspaces", "default");
}
