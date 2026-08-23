import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

function readOpencodeModel(): string | null {
  try {
    const path = join(ROOT, "opencode.json");
    const raw = readFileSync(path, "utf-8");
    const json = JSON.parse(raw) as { model?: string };
    if (typeof json.model === "string" && json.model.length > 0) {
      return json.model;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getVortexModel(): string {
  // Priority: opencode.json "model" > env override > fallback
  if (Bun.env.VORTEX_MODEL) return Bun.env.VORTEX_MODEL;
  if (Bun.env.LLM_MODEL) {
    // If LLM_MODEL looks like opencode model (contains "/"), prefer it when VORTEX_MODEL not set and opencode.json missing
    // But opencode.json takes precedence if present
  }

  const model = readOpencodeModel();
  if (model) {
    return model;
  }

  if (Bun.env.LLM_MODEL) return Bun.env.LLM_MODEL;

  return "opencode-go/ox-alpha-free";
}

export function getEmbeddingModel(): string {
  return Bun.env.EMBEDDING_MODEL || "text-embedding-qwen3-embedding-8b";
}

export function getVortexModelSync(): string {
  return getVortexModel();
}
