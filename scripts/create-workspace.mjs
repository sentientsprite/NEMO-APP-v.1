#!/usr/bin/env node
/**
 * create-nemo-workspace — bootstrap a local NEMO workspace directory.
 *
 * Usage:
 *   node scripts/create-workspace.mjs [target-dir]
 *   pnpm create-workspace
 */

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const templateDir = path.join(repoRoot, "templates", "workspaces", "default");
const targetDir = path.resolve(process.argv[2] ?? path.join(process.cwd(), ".nemo-workspace"));

async function copyTemplate() {
  if (!existsSync(templateDir)) {
    console.error("Template not found:", templateDir);
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });

  const files = ["MEMORY.md", "AGENTS.md", "DNA.md", "TOKEN-EFFICIENCY.md"];
  for (const file of files) {
    const src = path.join(templateDir, file);
    const dest = path.join(targetDir, file);
    if (existsSync(src)) {
      await cp(src, dest);
      console.log("  +", file);
    }
  }

  const refsSrc = path.join(templateDir, "references");
  const refsDest = path.join(targetDir, "references");
  if (existsSync(refsSrc)) {
    await mkdir(refsDest, { recursive: true });
    const { readdir } = await import("node:fs/promises");
    const refs = await readdir(refsSrc);
    for (const ref of refs) {
      await cp(path.join(refsSrc, ref), path.join(refsDest, ref));
      console.log("  + references/" + ref);
    }
  }

  await mkdir(path.join(targetDir, "memory"), { recursive: true });
  await mkdir(path.join(targetDir, "workflows"), { recursive: true });
  await mkdir(path.join(targetDir, ".index"), { recursive: true });

  const envExample = `NEMO_WORKSPACE_ROOT=${targetDir}\n`;
  const envPath = path.join(repoRoot, "apps", "workspace", ".env.local");
  if (!existsSync(envPath)) {
    await writeFile(envPath, envExample, "utf8");
    console.log("  + apps/workspace/.env.local");
  }
}

console.log("NEMO Workspace installer");
console.log("Target:", targetDir);
console.log("");

await copyTemplate();

console.log("");
console.log("Done. Next steps:");
console.log("  cd", repoRoot);
console.log("  pnpm install");
console.log("  pnpm dev");
console.log("");
console.log("Open http://localhost:8420");
console.log("Seed memory from template: POST /api/workspace or visit Memory page");
