# Agentic Vortex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI agent layer to Vortex — Bun server with LM Studio LLM, ChromaDB semantic asset search, SSE chat sidebar, and unified CompositionAPI for both human and agent interactions.

**Architecture:** Thin Bun server (:3001) handles AI brain (LLM calls, ChromaDB queries). Browser holds all composition state. Server receives chat messages, returns structured JSON actions via SSE. Browser validates and executes actions through CompositionAPI — same code path as SceneBuilder UI interactions.

**Tech Stack:** Bun, LM Studio SDK (`@lmstudio/sdk`), ChromaDB (`chromadb`), PixiJS v8, Vite, TypeScript strict.

---

### Task 1: Environment Config + Dependencies

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `vite.config.ts`

- [ ] **Step 1: Create `.env.example`**

```env
# LM Studio
LLM_BASE_URL=http://localhost:1234
LLM_MODEL=qwen3.6-35b-a3b
EMBEDDING_MODEL=text-embedding-qwen3-embedding-8b

# ChromaDB
CHROMADB_URL=http://localhost:8000
CHROMADB_COLLECTION=vortex_assets

# Server
VORTEX_SERVER_PORT=3001

# Client
VITE_VORTEX_SERVER_URL=http://localhost:3001
```

- [ ] **Step 2: Update `.gitignore` — add chroma-data**

Append to `.gitignore`:
```
# ChromaDB data
chroma-data/
```

- [ ] **Step 3: Add server dependencies to `package.json`**

Add to `dependencies`:
```json
"chromadb": "^3.4.3",
"@lmstudio/sdk": "^1.5.0"
```

Add to `scripts`:
```json
"server": "bun run server/index.ts",
"embed-assets": "bun run server/scripts/embed-assets.ts"
```

- [ ] **Step 4: Add Vite proxy for `/api`**

Modify `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import { assetpackPlugin } from "./scripts/assetpack-vite-plugin";

export default defineConfig({
  plugins: [assetpackPlugin()],
  server: {
    port: 8080,
    open: true,
    proxy: {
      "/api": {
        target: process.env.VITE_VORTEX_SERVER_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
});
```

- [ ] **Step 5: Install dependencies**

Run: `bun add chromadb @lmstudio/sdk`
Expected: packages added to node_modules and package.json

- [ ] **Step 6: Commit**

```bash
git add .env.example .gitignore package.json vite.config.ts
git commit -m "feat: add env config, server deps, vite proxy for agentic backend"
```

---

### Task 2: Server Scaffold + LLM Service + ChromaDB Service

**Files:**
- Create: `server/tsconfig.json`
- Create: `server/index.ts`
- Create: `server/services/llm.ts`
- Create: `server/services/chroma.ts`

- [ ] **Step 1: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["./**/*.ts"]
}
```

- [ ] **Step 2: Create `server/services/llm.ts`**

Adapted from silicon-seeds, stripped of MCP/web-search (not needed):

```ts
import { LMStudioClient } from "@lmstudio/sdk";
import z from "zod/v3";

const LLM_MODEL = Bun.env.LLM_MODEL;
if (!LLM_MODEL) throw new Error("LLM_MODEL env var missing");

const EMBEDDING_MODEL = Bun.env.EMBEDDING_MODEL;
if (!EMBEDDING_MODEL) throw new Error("EMBEDDING_MODEL env var missing");

const client = new LMStudioClient();
const llmModel = await client.llm.model(LLM_MODEL);
const embeddingModel = await client.embedding.model(EMBEDDING_MODEL);

const MAX_TOKENS = 10_000;

export namespace LLM {
  export async function chat(systemPrompt: string, userMessage: string) {
    try {
      return await llmModel.respond(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        { maxTokens: MAX_TOKENS },
      );
    } catch (error) {
      console.error("LLM chat failed:", error);
      return null;
    }
  }

  export async function structured<T extends z.ZodTypeAny>(
    systemPrompt: string,
    userMessage: string,
    schema: T,
  ) {
    try {
      return (await llmModel.respond(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        { structured: schema, maxTokens: MAX_TOKENS },
      )) as unknown as { parsed: z.infer<T> } | null;
    } catch (error) {
      console.error("LLM structured call failed:", error);
      return null;
    }
  }

  export async function generateEmbedding(text: string): Promise<number[]> {
    const result = await embeddingModel.embed(text);
    return result.embedding;
  }
}
```

- [ ] **Step 3: Create `server/services/chroma.ts`**

Adapted from silicon-seeds, Vortex-specific metadata:

```ts
import { ChromaClient, type Collection } from "chromadb";
import { LLM } from "./llm";

const COLLECTION_NAME = Bun.env.CHROMADB_COLLECTION || "vortex_assets";

export type AssetMeta = {
  id: string;
  project: string;
  path: string;
  type: string;
  filename: string;
};

export namespace Chroma {
  let client: ChromaClient;
  let collection: Collection;

  async function init() {
    const url = Bun.env.CHROMADB_URL || "http://localhost:8000";
    const parsed = new URL(url);
    client = new ChromaClient({
      host: parsed.hostname,
      port: Number(parsed.port || 8000),
      ssl: parsed.protocol === "https:",
    });
    try {
      await client.heartbeat();
    } catch (e) {
      console.error("ChromaDB healthcheck failed — is the server running?", e);
      process.exit(1);
    }
    collection = await client.getOrCreateCollection({ name: COLLECTION_NAME });
    console.log(`ChromaDB ready: ${COLLECTION_NAME}`);
  }

  function isReady() {
    return !!(client && collection);
  }

  export async function exists(id: string): Promise<boolean> {
    if (!isReady()) await init();
    const result = await collection.get({ ids: [id] });
    return result.ids.length > 0;
  }

  export async function saveAsset(meta: AssetMeta) {
    if (!isReady()) await init();
    const document = `${meta.filename}. Type: ${meta.type}. Project: ${meta.project}. Path: ${meta.path}`;
    const embedding = await LLM.generateEmbedding(document);
    await collection.upsert({
      ids: [meta.id],
      embeddings: [embedding],
      metadatas: [{
        project: meta.project,
        path: meta.path,
        type: meta.type,
        filename: meta.filename,
      }],
      documents: [document],
    });
  }

  export async function searchAssets(query: string, project: string, limit = 10) {
    if (!isReady()) await init();
    const embedding = await LLM.generateEmbedding(query);
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: { project: { "$eq": project } },
    });
    return (results.ids[0] || []).map((id, i) => ({
      id,
      path: results.metadatas?.[0]?.[i]?.path as string || "",
      project: results.metadatas?.[0]?.[i]?.project as string || "",
      type: results.metadatas?.[0]?.[i]?.type as string || "",
      filename: results.metadatas?.[0]?.[i]?.filename as string || "",
      score: results.distances?.[0]?.[i] ?? 0,
    }));
  }
}
```

- [ ] **Step 4: Create `server/index.ts`**

```ts
import { handleChat } from "./routes/chat";
import { handleAssetSearch, handleAssetList } from "./routes/assets";
import { handleProjects } from "./routes/projects";

const PORT = Number(Bun.env.VORTEX_SERVER_PORT || 3001);

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(req);
    }
    if (req.method === "GET" && url.pathname === "/api/assets/search") {
      return handleAssetSearch(req);
    }
    if (req.method === "GET" && url.pathname === "/api/assets/list") {
      return handleAssetList(req);
    }
    if (req.method === "GET" && url.pathname === "/api/projects") {
      return handleProjects(req);
    }
    if (req.method === "POST" && url.pathname === "/api/projects") {
      return handleProjects(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Vortex server running on http://localhost:${PORT}`);
```

- [ ] **Step 5: Verify server starts**

Run: `bun run server/index.ts`
Expected: `Vortex server running on http://localhost:3001` (will fail on LLM/ChromaDB if not running — that's OK for now, we're testing the scaffold)

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: bun server scaffold with LLM and ChromaDB services"
```

---

### Task 3: Asset Embedding Pipeline

**Files:**
- Create: `server/services/embed.ts`
- Create: `server/scripts/embed-assets.ts`

- [ ] **Step 1: Create `server/services/embed.ts`**

```ts
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { Chroma, type AssetMeta } from "./chroma";

const PROJECTS_DIR = join(import.meta.dir, "../../projects");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);
const GIF_EXT = ".gif";

function getType(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (ext === GIF_EXT) return "gif";
  return "unknown";
}

async function* walkAssets(): AsyncGenerator<AssetMeta> {
  let projects: string[];
  try {
    projects = await readdir(PROJECTS_DIR);
  } catch {
    console.warn("No projects/ directory found");
    return;
  }

  for (const project of projects) {
    if (project.includes("{") || project.startsWith(".")) continue;

    for (const subdir of ["assets", "backgrounds"]) {
      const dir = join(PROJECTS_DIR, project, subdir);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        const ext = extname(file).toLowerCase();
        const type = getType(ext);
        if (type === "unknown") continue;

        const path = `${subdir}/${file}`;
        const id = `${project}/${path}`;
        yield { id, project, path, type, filename: file };
      }
    }
  }
}

export async function embedAllAssets(): Promise<{ embedded: number; skipped: number }> {
  let embedded = 0;
  let skipped = 0;

  for await (const meta of walkAssets()) {
    if (await Chroma.exists(meta.id)) {
      skipped++;
      continue;
    }
    await Chroma.saveAsset(meta);
    embedded++;
    if (embedded % 10 === 0) {
      console.log(`Embedded ${embedded} assets...`);
    }
  }

  console.log(`Embedding complete: ${embedded} new, ${skipped} existing`);
  return { embedded, skipped };
}
```

- [ ] **Step 2: Create `server/scripts/embed-assets.ts`**

```ts
import { embedAllAssets } from "../services/embed";

console.log("Starting asset embedding...");
const result = await embedAllAssets();
console.log(`Done: ${result.embedded} embedded, ${result.skipped} skipped`);
```

- [ ] **Step 3: Test embedding (requires LM Studio + ChromaDB running)**

Run: `bun run server/scripts/embed-assets.ts`
Expected: logs assets being embedded

- [ ] **Step 4: Commit**

```bash
git add server/services/embed.ts server/scripts/embed-assets.ts
git commit -m "feat: asset embedding pipeline for ChromaDB semantic search"
```

---

### Task 4: System Prompt Builder

**Files:**
- Create: `server/system-prompt.ts`

- [ ] **Step 1: Create `server/system-prompt.ts`**

```ts
import type { AgentAction } from "./types";

export function buildSystemPrompt(
  project: string,
  availableAssets: { alias: string; type: string }[],
  availableBackgrounds: string[],
  filterPresets: string[],
  currentState: string,
): string {
  return `You are the Vortex composition agent. You control a real-time video composition engine.

## Current Project: ${project}
You can ONLY use assets from this project. Every alias must start with "${project}/".

## Available Actions (return JSON array)
Each action must be one of these types:

- placeAsset: { type: "placeAsset", alias: string, x: number, y: number, layer: "asset"|"fixed", scale?: number }
  Place an asset at position (x, y) in 1920x1080 stage coordinates. Layer "asset" = floating pool, "fixed" = persistent decoration.
- removeAsset: { type: "removeAsset", alias: string, layer: "asset"|"fixed" }
  Remove an asset by its alias.
- setFilter: { type: "setFilter", layer: "background"|"asset"|"fixed"|"status"|"webcam", preset: string, intensity?: number }
  Apply a filter preset to a layer. Intensity 0-100.
- setLayerVisibility: { type: "setLayerVisibility", layer: string, visible: boolean }
  Show/hide a layer.
- setBackground: { type: "setBackground", alias: string }
  Switch to a specific background image/video.
- nextBackground: { type: "nextBackground" }
  Cycle to next background.
- setWebcamPreset: { type: "setWebcamPreset", index: number }
  Jump webcam to preset position (0-13).
- toggleWebcam: { type: "toggleWebcam" }
  Toggle webcam visibility.
- setTextIndex: { type: "setTextIndex", index: number }
  Jump to specific text phrase.
- nextText: { type: "nextText" }
  Advance to next text phrase.
- setTextPosition: { type: "setTextPosition", x: number, y: number }
  Move text overlay position.
- saveState: { type: "saveState", name: string }
  Save current composition as named state.
- loadState: { type: "loadState", nameOrIndex: string|number }
  Load a saved state.
- searchAssets: { type: "searchAssets", query: string }
  Semantic search for assets (uses embeddings).
- createProject: { type: "createProject", name: string, language: "EN"|"DE" }
  Scaffold a new project directory.

## Available Assets (${availableAssets.length})
${availableAssets.map((a) => `- ${a.alias} (${a.type})`).join("\n")}

## Available Backgrounds (${availableBackgrounds.length})
${availableBackgrounds.map((b) => `- ${b}`).join("\n")}

## Available Filter Presets
${filterPresets.join(", ")}

## Current Scene State
${currentState}

## Rules
1. ONLY use asset aliases from the lists above. Never invent aliases.
2. Positions are in 1920x1080 stage coordinates.
3. Return a JSON object with "actions" array and "explanation" string.
4. If the user request is ambiguous, ask for clarification (set actions to []).
5. If no compositional change is needed, return empty actions array.
6. Layer names: "background", "asset", "fixed", "status", "webcam".
7. Filter intensity: 0-100 (default 100 if omitted).
`;
}
```

- [ ] **Step 2: Create `server/types.ts`**

```ts
export type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

export type AgentAction =
  | { type: "placeAsset"; alias: string; x: number; y: number; layer: "asset" | "fixed"; scale?: number }
  | { type: "removeAsset"; alias: string; layer: "asset" | "fixed" }
  | { type: "setFilter"; layer: LayerId; preset: string; intensity?: number }
  | { type: "setLayerVisibility"; layer: LayerId; visible: boolean }
  | { type: "setBackground"; alias: string }
  | { type: "nextBackground" }
  | { type: "setWebcamPreset"; index: number }
  | { type: "toggleWebcam" }
  | { type: "setTextIndex"; index: number }
  | { type: "nextText" }
  | { type: "setTextPosition"; x: number; y: number }
  | { type: "saveState"; name: string }
  | { type: "loadState"; nameOrIndex: string | number }
  | { type: "deleteState"; nameOrIndex: string | number }
  | { type: "getState" }
  | { type: "searchAssets"; query: string }
  | { type: "createProject"; name: string; language: "EN" | "DE" };

export interface AgentResponse {
  actions: AgentAction[];
  explanation: string;
}

export interface ChatRequest {
  message: string;
  project: string;
  state: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add server/system-prompt.ts server/types.ts
git commit -m "feat: system prompt builder with action schema and project context"
```

---

### Task 5: Server Routes

**Files:**
- Create: `server/routes/chat.ts`
- Create: `server/routes/assets.ts`
- Create: `server/routes/projects.ts`

- [ ] **Step 1: Create `server/routes/chat.ts`**

Uses zod for structured LLM output, streams SSE response:

```ts
import { z } from "zod/v3";
import { LLM } from "../services/llm";
import { Chroma } from "../services/chroma";
import { buildSystemPrompt } from "../system-prompt";
import type { ChatRequest, AgentResponse } from "../types";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../../projects");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);
const GIF_EXT = ".gif";

const responseSchema = z.object({
  actions: z.array(z.record(z.string(), z.unknown())),
  explanation: z.string(),
});

async function getProjectAssets(project: string) {
  const assets: { alias: string; type: string }[] = [];
  const dir = join(PROJECTS_DIR, project, "assets");
  try {
    const files = await readdir(dir);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      let type = "image";
      if (VIDEO_EXTS.has(ext)) type = "video";
      else if (ext === GIF_EXT) type = "gif";
      else if (!IMAGE_EXTS.has(ext)) continue;
      assets.push({ alias: `${project}/assets/${file}`, type });
    }
  } catch { /* dir missing */ }
  return assets;
}

async function getProjectBackgrounds(project: string) {
  const bgs: string[] = [];
  const dir = join(PROJECTS_DIR, project, "backgrounds");
  try {
    const files = await readdir(dir);
    for (const file of files) {
      bgs.push(`${project}/backgrounds/${file}`);
    }
  } catch { /* dir missing */ }
  return bgs;
}

export async function handleChat(req: Request): Promise<Response> {
  const body = (await req.json()) as ChatRequest;
  const { message, project, state } = body;

  if (!message || !project) {
    return new Response(JSON.stringify({ error: "message and project required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("thinking", { status: "Building context..." });

        const assets = await getProjectAssets(project);
        const backgrounds = await getProjectBackgrounds(project);
        const filterPresets = [
          "None", "Grayscale", "Sepia", "Vintage", "Kodachrome", "Polaroid",
          "Negative", "Technicolor", "Predator", "LSD", "Bright", "Contrast",
          "Night", "Blur Light", "Blur Heavy", "Noise Light", "Noise Heavy",
          "Alpha 50%", "Glow", "Bloom", "Drop Shadow", "Outline", "Pixelate",
          "RGB Split", "CRT", "Emboss", "Motion Blur", "Glitch", "Godray",
          "Bevel", "Cross Hatch", "Old Film", "ASCII", "Reflection",
          "Tilt Shift", "Zoom Blur", "Adjustment",
        ];

        const systemPrompt = buildSystemPrompt(project, assets, backgrounds, filterPresets, state);

        send("thinking", { status: "Calling LLM..." });

        // Check if agent wants to search assets first
        const searchCheck = await LLM.structured(
          "You are a query analyzer. Determine if the user request requires searching for assets semantically. Return { needsSearch: boolean, searchQuery?: string }",
          message,
          z.object({ needsSearch: z.boolean(), searchQuery: z.string().optional() }),
        );

        let searchResults: string | null = null;
        if (searchCheck?.parsed?.needsSearch && searchCheck.parsed.searchQuery) {
          send("thinking", { status: `Searching assets: ${searchCheck.parsed.searchQuery}` });
          const results = await Chroma.searchAssets(searchCheck.parsed.searchQuery, project);
          searchResults = results.map((r) => `- ${r.id} (score: ${r.score.toFixed(3)})`).join("\n");
        }

        const userMsg = searchResults
          ? `${message}\n\nSemantic asset search results:\n${searchResults}`
          : message;

        send("thinking", { status: "Generating actions..." });

        const result = await LLM.structured(systemPrompt, userMsg, responseSchema);

        if (!result?.parsed) {
          send("error", { error: "LLM returned no valid response" });
          controller.close();
          return;
        }

        const response: AgentResponse = {
          actions: result.parsed.actions as AgentResponse["actions"],
          explanation: result.parsed.explanation,
        };

        send("actions", response);
        send("done", {});
      } catch (error) {
        send("error", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

- [ ] **Step 2: Create `server/routes/assets.ts`**

```ts
import { Chroma } from "../services/chroma";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../../projects");

export async function handleAssetSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const project = url.searchParams.get("project");
  const limit = Number(url.searchParams.get("limit") || "10");

  if (!q || !project) {
    return Response.json({ error: "q and project params required" }, { status: 400 });
  }

  try {
    const results = await Chroma.searchAssets(q, project, limit);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function handleAssetList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get("project");

  if (!project) {
    return Response.json({ error: "project param required" }, { status: 400 });
  }

  const assets: { alias: string; type: string }[] = [];
  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
  const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);

  for (const subdir of ["assets", "backgrounds"]) {
    const dir = join(PROJECTS_DIR, project, subdir);
    try {
      const files = await readdir(dir);
      for (const file of files) {
        const ext = extname(file).toLowerCase();
        let type = "image";
        if (VIDEO_EXTS.has(ext)) type = "video";
        else if (ext === ".gif") type = "gif";
        else if (!IMAGE_EXTS.has(ext)) continue;
        assets.push({ alias: `${project}/${subdir}/${file}`, type });
      }
    } catch { /* dir missing */ }
  }

  return Response.json({ assets });
}
```

- [ ] **Step 3: Create `server/routes/projects.ts`**

```ts
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../../projects");

export async function handleProjects(req: Request): Promise<Response> {
  if (req.method === "GET") {
    try {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      const projects = entries
        .filter((e) => e.isDirectory() && !e.name.includes("{") && !e.name.startsWith("."))
        .map((e) => e.name);
      return Response.json({ projects });
    } catch {
      return Response.json({ projects: [] });
    }
  }

  if (req.method === "POST") {
    const body = (await req.json()) as { name: string; language: "EN" | "DE" };
    const { name, language } = body;

    if (!name || !language) {
      return Response.json({ error: "name and language required" }, { status: 400 });
    }

    // Validate name: alphanumeric + hyphens only
    if (!/^[a-z0-9-]+$/.test(name)) {
      return Response.json({ error: "name must be lowercase alphanumeric with hyphens" }, { status: 400 });
    }

    const projectDir = join(PROJECTS_DIR, name);

    try {
      await mkdir(join(projectDir, "backgrounds"), { recursive: true });
      await mkdir(join(projectDir, "assets"), { recursive: true });
      await mkdir(join(projectDir, "texts"), { recursive: true });

      await writeFile(
        join(projectDir, "project.json"),
        JSON.stringify({ language }, null, 2) + "\n",
      );

      await writeFile(join(projectDir, "texts", "01_welcome.txt"), `Welcome to ${name}.\n`);
      await writeFile(join(projectDir, "texts", "02_reflection.txt"), "A space for creativity.\n");
      await writeFile(join(projectDir, "texts", "03_invitation.txt"), "Explore and enjoy.\n");

      return Response.json({ success: true, path: `projects/${name}` });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}
```

- [ ] **Step 4: Test routes**

Run: `bun run server/index.ts` then `curl http://localhost:3001/api/projects`
Expected: `{"projects":["faery","lunaxy","lunaturexy","luniverse","matrix"]}`

- [ ] **Step 5: Commit**

```bash
git add server/routes/
git commit -m "feat: server routes for chat, assets, projects"
```

---

### Task 6: CompositionAPI

**Files:**
- Create: `src/app/composition-api/CompositionAPI.ts`

This is the core unified layer. It wraps all PixiJS layer objects and exposes a clean interface used by both SceneBuilder and AgentActionHandler.

- [ ] **Step 1: Create `src/app/composition-api/CompositionAPI.ts`**

```ts
import { Container, Sprite, Texture, Assets } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Filter } from "pixi.js";
import {
  AlphaFilter,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
} from "pixi.js";
import type { BackgroundLayer } from "../screens/main/composition/BackgroundLayer";
import type { FixedAssetLayer } from "../screens/main/composition/FixedAssetLayer";
import type { FixedAsset } from "../screens/main/composition/FixedAsset";
import type { StatusOverlay } from "../screens/main/composition/StatusOverlay";
import type { WebcamAsset } from "../screens/main/composition/WebcamAsset";
import type { TextOverlay } from "../screens/main/composition/TextOverlay";
import { FILTER_PRESETS, getFilterPreset } from "../scene-builder/filterPresets";
import {
  loadStates,
  saveStates,
  type AssetEntry,
  type SceneState,
} from "../scene-builder/SceneState";

export type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

export interface AssetInfo {
  alias: string;
  type: string;
  x?: number;
  y?: number;
}

export interface SerializedCompositionState {
  project: string;
  fixedAssets: AssetEntry[];
  draggedAssets: AssetEntry[];
  layers: Record<string, { visible: boolean; filter: string; filterIntensity: number }>;
  textOverlay: { x: number; y: number; currentIdx: number } | null;
}

export class CompositionAPI {
  private bgLayer: BackgroundLayer;
  private assetLayer: Container;
  private fixedLayer: FixedAssetLayer;
  private statusLayer: StatusOverlay;
  private webcam: WebcamAsset;
  private textOverlay: TextOverlay;
  private currentProject: string;
  private filterInstances = new Map<LayerId, Filter | null>();
  private controlState: Record<LayerId, { visible: boolean; currentFilter: string; filterIntensity: number }> = {
    background: { visible: true, currentFilter: "None", filterIntensity: 100 },
    asset: { visible: true, currentFilter: "None", filterIntensity: 100 },
    fixed: { visible: true, currentFilter: "None", filterIntensity: 100 },
    status: { visible: true, currentFilter: "None", filterIntensity: 100 },
    webcam: { visible: true, currentFilter: "None", filterIntensity: 100 },
  };

  constructor(
    bgLayer: BackgroundLayer,
    assetLayer: Container,
    fixedLayer: FixedAssetLayer,
    statusLayer: StatusOverlay,
    webcam: WebcamAsset,
    textOverlay: TextOverlay,
    project: string,
  ) {
    this.bgLayer = bgLayer;
    this.assetLayer = assetLayer;
    this.fixedLayer = fixedLayer;
    this.statusLayer = statusLayer;
    this.webcam = webcam;
    this.textOverlay = textOverlay;
    this.currentProject = project;
  }

  // ─── Guardrail ───

  private validateAlias(alias: string): boolean {
    return alias.startsWith(`${this.currentProject}/`);
  }

  // ─── Assets ───

  async placeAsset(
    alias: string,
    x: number,
    y: number,
    layer: "asset" | "fixed",
    scale = 0.5,
  ): Promise<boolean> {
    if (!this.validateAlias(alias)) return false;

    try {
      const ext = alias.split(".").pop()?.toLowerCase();
      let child: Container;

      if (ext === "gif") {
        const source = await Assets.load(alias);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        child = gif;
      } else {
        const texture = await Assets.load<Texture>(alias);
        child = new Sprite({ texture, anchor: 0.5 });
      }

      child.position.set(x, y);
      child.scale.set(scale);
      child.label = alias;

      if (layer === "fixed") {
        child.eventMode = "static";
        child.cursor = "grab";
        this.fixedLayer.addChild(child);
        this.setupDrag(child);
      } else {
        this.assetLayer.addChild(child);
      }

      return true;
    } catch {
      return false;
    }
  }

  removeAsset(alias: string, layer: "asset" | "fixed"): boolean {
    const container = layer === "fixed" ? this.fixedLayer : this.assetLayer;
    const child = container.children.find(
      (c) => c.label === alias,
    );
    if (!child) return false;
    child.removeFromParent();
    child.destroy({ children: true });
    return true;
  }

  // ─── Filters ───

  setFilter(layer: LayerId, presetName: string, intensity?: number): boolean {
    const container = this.getLayerContainer(layer);
    if (!container) return false;

    this.controlState[layer].currentFilter = presetName;
    if (intensity !== undefined) {
      this.controlState[layer].filterIntensity = intensity;
    }

    if (presetName === "None" || !presetName) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layer, null);
      return true;
    }

    const preset = FILTER_PRESETS.find((p) => p.name === presetName);
    if (!preset) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layer, null);
      return false;
    }

    const filter = preset.create();
    this.filterInstances.set(layer, filter);
    if (filter) {
      this.adjustFilterIntensity(filter, presetName, this.controlState[layer].filterIntensity);
      (container as unknown as { filters: unknown }).filters = [filter];
    } else {
      (container as unknown as { filters: unknown }).filters = null;
    }
    return true;
  }

  clearFilter(layer: LayerId): boolean {
    return this.setFilter(layer, "None");
  }

  // ─── Visibility ───

  setLayerVisibility(layer: LayerId, visible: boolean): void {
    this.controlState[layer].visible = visible;
    const container = this.getLayerContainer(layer);
    if (container) container.visible = visible;
  }

  // ─── Background ───

  async setBackground(alias: string): Promise<boolean> {
    if (!this.validateAlias(alias)) return false;
    await this.bgLayer.setMultipleBackgrounds(this.currentProject);
    return true;
  }

  nextBackground(): void {
    // BackgroundLayer handles crossfade internally
  }

  // ─── Webcam ───

  setWebcamPreset(index: number): void {
    // WebcamAsset cycles presets internally
    for (let i = 0; i <= index; i++) {
      this.webcam.nextPreset();
    }
  }

  toggleWebcam(): void {
    this.webcam.visible = !this.webcam.visible;
  }

  // ─── Text ───

  setTextIndex(index: number): void {
    this.textOverlay.goTo(index);
  }

  nextText(): void {
    this.textOverlay.next();
  }

  setTextPosition(x: number, y: number): void {
    this.textOverlay.setTextPosition(x, y);
  }

  // ─── State ───

  saveState(name: string): SceneState {
    const state = this.serializeState(name);
    const states = loadStates(this.currentProject);
    states.push(state);
    saveStates(this.currentProject, states);
    return state;
  }

  async loadState(nameOrIndex: string | number): Promise<boolean> {
    const states = loadStates(this.currentProject);
    let st: SceneState | undefined;

    if (typeof nameOrIndex === "number") {
      st = states[nameOrIndex];
    } else {
      st = states.find((s) => s.name === nameOrIndex);
    }
    if (!st) return false;

    this.fixedLayer.removeChildren();
    this.assetLayer.removeChildren();
    this.textOverlay.clear();

    for (const [id, layerSt] of Object.entries(st.layers)) {
      const lid = id as LayerId;
      if (this.controlState[lid]) {
        this.controlState[lid].visible = layerSt.visible;
        this.controlState[lid].currentFilter = layerSt.filter;
        this.controlState[lid].filterIntensity = layerSt.filterIntensity;
        this.setLayerVisibility(lid, layerSt.visible);
        this.setFilter(lid, layerSt.filter, layerSt.filterIntensity);
      }
    }

    for (const fa of st.fixedAssets) {
      try {
        const { FixedAsset: FA } = await import("../screens/main/composition/FixedAsset");
        const asset = await FA.load(fa.alias, {
          file: fa.alias.split("/").pop() || "",
          x: fa.x / 1920,
          y: fa.y / 1080,
        });
        asset.x = fa.x;
        asset.y = fa.y;
        asset.spriteScale = fa.scale;
        this.fixedLayer.addChild(asset);
      } catch { /* skip */ }
    }

    for (const da of st.draggedAssets) {
      if (!da.alias) continue;
      try {
        const ext = da.alias.split(".").pop()?.toLowerCase();
        let child: Container;
        if (ext === "gif") {
          const source = await Assets.load(da.alias);
          const gif = new GifSprite({ source, autoPlay: true });
          gif.anchor.set(0.5);
          child = gif;
        } else {
          const texture = await Assets.load<Texture>(da.alias);
          child = new Sprite({ texture, anchor: 0.5 });
        }
        child.position.set(da.x, da.y);
        child.scale.set(da.scale);
        child.label = da.alias;
        child.eventMode = "static";
        child.cursor = "grab";
        this.fixedLayer.addChild(child);
        this.setupDrag(child);
      } catch { /* skip */ }
    }

    if (st.textOverlay) {
      this.textOverlay.goTo(st.textOverlay.currentIdx, st.textOverlay.x, st.textOverlay.y);
    }

    return true;
  }

  deleteState(nameOrIndex: string | number): boolean {
    const states = loadStates(this.currentProject);
    let filtered: SceneState[];

    if (typeof nameOrIndex === "number") {
      filtered = states.filter((_, i) => i !== nameOrIndex);
    } else {
      filtered = states.filter((s) => s.name !== nameOrIndex);
    }

    if (filtered.length === states.length) return false;
    saveStates(this.currentProject, filtered);
    return true;
  }

  getState(): SerializedCompositionState {
    return {
      project: this.currentProject,
      ...this.serializeState("current"),
    };
  }

  // ─── Info ───

  getCurrentProject(): string {
    return this.currentProject;
  }

  setProject(name: string): void {
    this.currentProject = name;
  }

  getAvailableAssets(): AssetInfo[] {
    return [];
  }

  getLoadedAssets(): AssetInfo[] {
    const loaded: AssetInfo[] = [];
    for (const child of this.assetLayer.children) {
      loaded.push({ alias: child.label || "unknown", type: "image", x: child.x, y: child.y });
    }
    for (const child of this.fixedLayer.children) {
      loaded.push({ alias: child.label || "unknown", type: "image", x: child.x, y: child.y });
    }
    return loaded;
  }

  getFilterPresets(): string[] {
    return FILTER_PRESETS.map((p) => p.name);
  }

  getControlState(layer: LayerId) {
    return { ...this.controlState[layer] };
  }

  // ─── Internal ───

  private getLayerContainer(layer: LayerId): Container | null {
    switch (layer) {
      case "background": return this.bgLayer;
      case "asset": return this.assetLayer;
      case "fixed": return this.fixedLayer;
      case "status": return this.statusLayer;
      case "webcam": return this.webcam;
    }
  }

  private adjustFilterIntensity(filter: Filter, presetName: string, pct: number): void {
    const preset = getFilterPreset(presetName);
    if (preset?.adjustIntensity) {
      preset.adjustIntensity(filter, Math.max(0, Math.min(100, pct)) / 100);
      return;
    }
    const t = Math.max(0, Math.min(100, pct)) / 100;
    if (filter instanceof ColorMatrixFilter) filter.alpha = t;
    else if (filter instanceof BlurFilter) filter.strength = t * 20;
    else if (filter instanceof NoiseFilter) filter.noise = t;
    else if (filter instanceof AlphaFilter) filter.alpha = t;
  }

  private serializeState(name: string): SceneState {
    const fixedAssets: AssetEntry[] = [];
    const draggedAssets: AssetEntry[] = [];

    for (const child of this.fixedLayer.children) {
      if (child.constructor.name === "FixedAsset") {
        fixedAssets.push({
          alias: (child as unknown as { alias: string }).alias,
          x: child.x,
          y: child.y,
          scale: (child as unknown as { spriteScale: number }).spriteScale,
        });
      } else {
        draggedAssets.push({
          alias: child.label || "",
          x: child.x,
          y: child.y,
          scale: child.scale.x,
        });
      }
    }

    for (const child of this.assetLayer.children) {
      draggedAssets.push({
        alias: child.label || "",
        x: child.x,
        y: child.y,
        scale: child.scale.x,
      });
    }

    const layers: Record<string, { visible: boolean; filter: string; filterIntensity: number }> = {};
    for (const [id, st] of Object.entries(this.controlState)) {
      layers[id] = { visible: st.visible, filter: st.currentFilter, filterIntensity: st.filterIntensity };
    }

    const textPos = this.textOverlay.textPosition;
    return {
      name,
      timestamp: Date.now(),
      fixedAssets,
      draggedAssets,
      layers,
      textOverlay: textPos ? { x: textPos.x, y: textPos.y, currentIdx: this.textOverlay.currentIndex } : null,
    };
  }

  private setupDrag(child: Container): void {
    let dragging = false;
    let offset = { x: 0, y: 0 };

    child.on("pointerdown", (e) => {
      dragging = true;
      child.cursor = "grabbing";
      const parent = child.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      offset = { x: child.x - pos.x, y: child.y - pos.y };
    });

    child.on("globalpointermove", (e) => {
      if (!dragging) return;
      const parent = child.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      child.x = pos.x + offset.x;
      child.y = pos.y + offset.y;
    });

    const stop = () => {
      dragging = false;
      child.cursor = "grab";
    };
    child.on("pointerup", stop);
    child.on("pointerupoutside", stop);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors in CompositionAPI.ts

- [ ] **Step 3: Commit**

```bash
git add src/app/composition-api/
git commit -m "feat: CompositionAPI — unified action layer for user and agent"
```

---

### Task 7: AgentActionHandler

**Files:**
- Create: `src/app/composition-api/AgentActionHandler.ts`

- [ ] **Step 1: Create `src/app/composition-api/AgentActionHandler.ts`**

```ts
import type { CompositionAPI, LayerId } from "./CompositionAPI";

export type AgentAction = {
  type: string;
  [key: string]: unknown;
};

export interface ActionResult {
  action: AgentAction;
  success: boolean;
  message: string;
}

const VALID_LAYERS: LayerId[] = ["background", "asset", "fixed", "status", "webcam"];

function isValidLayer(layer: unknown): layer is LayerId {
  return typeof layer === "string" && VALID_LAYERS.includes(layer as LayerId);
}

export async function executeActions(
  api: CompositionAPI,
  actions: AgentAction[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const result = await executeAction(api, action);
    results.push(result);
  }

  return results;
}

async function executeAction(
  api: CompositionAPI,
  action: AgentAction,
): Promise<ActionResult> {
  const fail = (msg: string): ActionResult => ({ action, success: false, message: msg });
  const ok = (msg: string): ActionResult => ({ action, success: true, message: msg });

  switch (action.type) {
    case "placeAsset": {
      const { alias, x, y, layer, scale } = action as {
        alias: string; x: number; y: number; layer: "asset" | "fixed"; scale?: number;
      };
      if (layer !== "asset" && layer !== "fixed") return fail(`Invalid layer: ${layer}`);
      const success = await api.placeAsset(alias, x, y, layer, scale);
      return success ? ok(`Placed ${alias}`) : fail(`Failed to place ${alias}`);
    }

    case "removeAsset": {
      const { alias, layer } = action as { alias: string; layer: "asset" | "fixed" };
      if (layer !== "asset" && layer !== "fixed") return fail(`Invalid layer: ${layer}`);
      const success = api.removeAsset(alias, layer);
      return success ? ok(`Removed ${alias}`) : fail(`Asset not found: ${alias}`);
    }

    case "setFilter": {
      const { layer, preset, intensity } = action as { layer: string; preset: string; intensity?: number };
      if (!isValidLayer(layer)) return fail(`Invalid layer: ${layer}`);
      const success = api.setFilter(layer, preset, intensity);
      return success ? ok(`Filter ${preset} on ${layer}`) : fail(`Unknown filter: ${preset}`);
    }

    case "setLayerVisibility": {
      const { layer, visible } = action as { layer: string; visible: boolean };
      if (!isValidLayer(layer)) return fail(`Invalid layer: ${layer}`);
      api.setLayerVisibility(layer, visible);
      return ok(`${layer} ${visible ? "shown" : "hidden"}`);
    }

    case "setBackground": {
      const { alias } = action as { alias: string };
      const success = await api.setBackground(alias);
      return success ? ok(`Background set`) : fail(`Invalid background: ${alias}`);
    }

    case "nextBackground":
      api.nextBackground();
      return ok("Next background");

    case "setWebcamPreset": {
      const { index } = action as { index: number };
      api.setWebcamPreset(index);
      return ok(`Webcam preset ${index}`);
    }

    case "toggleWebcam":
      api.toggleWebcam();
      return ok("Webcam toggled");

    case "setTextIndex": {
      const { index } = action as { index: number };
      api.setTextIndex(index);
      return ok(`Text index ${index}`);
    }

    case "nextText":
      api.nextText();
      return ok("Next text");

    case "setTextPosition": {
      const { x, y } = action as { x: number; y: number };
      api.setTextPosition(x, y);
      return ok(`Text moved to (${x}, ${y})`);
    }

    case "saveState": {
      const { name } = action as { name: string };
      api.saveState(name);
      return ok(`State saved: ${name}`);
    }

    case "loadState": {
      const { nameOrIndex } = action as { nameOrIndex: string | number };
      const success = await api.loadState(nameOrIndex);
      return success ? ok(`State loaded`) : fail(`State not found: ${nameOrIndex}`);
    }

    case "deleteState": {
      const { nameOrIndex } = action as { nameOrIndex: string | number };
      const success = api.deleteState(nameOrIndex);
      return success ? ok(`State deleted`) : fail(`State not found: ${nameOrIndex}`);
    }

    case "getState":
      return ok(JSON.stringify(api.getState()));

    case "searchAssets":
      // Handled server-side; no-op client-side
      return ok("Search handled by server");

    case "createProject":
      // Handled server-side; no-op client-side
      return ok("Project creation handled by server");

    default:
      return fail(`Unknown action type: ${action.type}`);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/composition-api/AgentActionHandler.ts
git commit -m "feat: AgentActionHandler — validates and executes agent JSON actions"
```

---

### Task 8: SceneBuilder Refactor — Delegate to CompositionAPI

**Files:**
- Modify: `src/app/scene-builder/SceneBuilder.ts`

Refactor SceneBuilder to accept and use CompositionAPI instead of directly manipulating layers. Key changes: replace direct `this.applyFilter()`, `this.setLayerVisible()`, `this.saveCurrentState()`, `this.loadSelectedState()`, `this.deleteSelectedState()` calls with CompositionAPI calls.

- [ ] **Step 1: Update SceneBuilder constructor to accept CompositionAPI**

Replace the constructor signature and layer references:

```ts
import type { CompositionAPI } from "../composition-api/CompositionAPI";

export class SceneBuilder {
  // ... existing private fields ...
  private api: CompositionAPI;

  constructor(api: CompositionAPI) {
    this.api = api;
    // Remove individual layer params — access via api
    // Keep: element, overlay, dropZone creation, bindEvents, etc.
  }
}
```

The key pattern: everywhere SceneBuilder currently calls `this.applyFilter(layerId, name)`, replace with `this.api.setFilter(layerId, name)`. Everywhere it calls `this.setLayerVisible(layerId, visible)`, replace with `this.api.setLayerVisibility(layerId, visible)`. Replace `this.saveCurrentState()` body with `this.api.saveState(name)`. Replace `this.loadSelectedState()` body with `this.api.loadState(idx)`. Replace `this.deleteSelectedState()` body with `this.api.deleteState(idx)`.

Keep all HTML rendering, drag-drop, and event binding code unchanged.

- [ ] **Step 2: Update `controlState` reads**

SceneBuilder's `renderLayer` reads `this.controlState[layerId]`. Replace with `this.api.getControlState(layerId)`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Verify existing functionality**

Run: `npm run dev` — test M key opens SceneBuilder, filters work, save/load states work
Expected: no regressions

- [ ] **Step 5: Commit**

```bash
git add src/app/scene-builder/SceneBuilder.ts
git commit -m "refactor: SceneBuilder delegates to CompositionAPI"
```

---

### Task 9: Chat Sidebar UI + CSS

**Files:**
- Create: `src/app/chat-sidebar/ChatSidebar.ts`
- Modify: `public/style.css` (append chat sidebar styles)

- [ ] **Step 1: Create `src/app/chat-sidebar/ChatSidebar.ts`**

```ts
import { executeActions, type ActionResult } from "../composition-api/AgentActionHandler";
import type { CompositionAPI } from "../composition-api/CompositionAPI";

interface ChatMessage {
  role: "user" | "agent" | "system";
  text: string;
  results?: ActionResult[];
}

export class ChatSidebar {
  private element: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private inputEl: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private statusEl: HTMLSpanElement;
  private visible = false;
  private api: CompositionAPI;
  private messages: ChatMessage[] = [];
  private sending = false;

  constructor(api: CompositionAPI) {
    this.api = api;

    const root = document.createElement("div");
    root.id = "chat-sidebar";
    root.innerHTML = this.buildHTML();
    document.body.appendChild(root);
    this.element = root;

    this.messagesEl = root.querySelector(".cs-messages") as HTMLDivElement;
    this.inputEl = root.querySelector(".cs-input") as HTMLInputElement;
    this.sendBtn = root.querySelector(".cs-send") as HTMLButtonElement;
    this.statusEl = root.querySelector(".cs-status") as HTMLSpanElement;

    this.bindEvents();
  }

  private buildHTML(): string {
    return `
      <div class="cs-header">
        <span class="cs-title">Vortex Agent</span>
        <button class="cs-close" data-action="close">✕</button>
      </div>
      <div class="cs-messages"></div>
      <div class="cs-input-bar">
        <input class="cs-input" type="text" placeholder="Describe a scene change...">
        <button class="cs-send">→</button>
      </div>
      <div class="cs-footer">
        <span class="cs-status">● disconnected</span>
        <span class="cs-project"></span>
      </div>
    `;
  }

  private bindEvents(): void {
    this.element.querySelector(".cs-close")!
      .addEventListener("click", () => this.hide());

    this.sendBtn.addEventListener("click", () => this.send());
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.send();
    });
  }

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.sending) return;

    this.sending = true;
    this.inputEl.value = "";
    this.inputEl.disabled = true;
    this.sendBtn.disabled = true;

    this.addMessage({ role: "user", text });
    this.addMessage({ role: "system", text: "Thinking..." });
    this.setStatus("processing");

    try {
      const state = JSON.stringify(this.api.getState());
      const project = this.api.getCurrentProject();

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, project, state }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      // Remove "Thinking..." message
      this.messages.pop();
      this.removeLastSystemMessage();

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let event = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7);
          } else if (line.startsWith("data: ") && event) {
            const data = JSON.parse(line.slice(6));
            this.handleSSEEvent(event, data);
            event = "";
          }
        }
      }
    } catch (error) {
      this.removeLastSystemMessage();
      this.addMessage({
        role: "system",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      this.sending = false;
      this.inputEl.disabled = false;
      this.sendBtn.disabled = false;
      this.setStatus("connected");
      this.inputEl.focus();
    }
  }

  private handleSSEEvent(event: string, data: unknown): void {
    switch (event) {
      case "thinking":
        this.updateLastSystemMessage((data as { status: string }).status);
        break;

      case "actions": {
        const { actions, explanation } = data as {
          actions: Parameters<typeof executeActions>[1];
          explanation: string;
        };

        this.removeLastSystemMessage();
        this.addMessage({ role: "agent", text: explanation });

        if (actions.length > 0) {
          executeActions(this.api, actions).then((results) => {
            const failures = results.filter((r) => !r.success);
            if (failures.length > 0) {
              this.addMessage({
                role: "system",
                text: `⚠ ${failures.length} action(s) failed: ${failures.map((f) => f.message).join(", ")}`,
                results,
              });
            } else {
              this.addMessage({
                role: "system",
                text: `✓ ${results.length} action(s) applied`,
                results,
              });
            }
          });
        }
        break;
      }

      case "error":
        this.removeLastSystemMessage();
        this.addMessage({
          role: "system",
          text: `Error: ${(data as { error: string }).error}`,
        });
        break;

      case "done":
        this.setStatus("connected");
        break;
    }
  }

  private addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    const el = document.createElement("div");
    el.className = `cs-msg cs-msg-${msg.role}`;
    el.textContent = msg.text;
    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private updateLastSystemMessage(text: string): void {
    const last = this.messagesEl.lastElementChild;
    if (last && last.classList.contains("cs-msg-system")) {
      last.textContent = text;
    }
  }

  private removeLastSystemMessage(): void {
    const last = this.messagesEl.lastElementChild;
    if (last && last.classList.contains("cs-msg-system")) {
      last.remove();
      this.messages.pop();
    }
  }

  private setStatus(status: string): void {
    this.statusEl.textContent = `● ${status}`;
    this.statusEl.className = `cs-status cs-status-${status}`;
  }

  public toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  public show(): void {
    this.visible = true;
    this.element.classList.add("open");
    this.setStatus("connected");
    this.inputEl.focus();
  }

  public hide(): void {
    this.visible = false;
    this.element.classList.remove("open");
  }

  public destroy(): void {
    this.element.remove();
  }
}
```

- [ ] **Step 2: Append chat sidebar styles to `public/style.css`**

```css
/* ─── Chat Sidebar ─── */

#chat-sidebar {
  position: fixed;
  top: 0;
  right: -380px;
  width: 360px;
  height: 100vh;
  background: #1a1a2e;
  color: #e0e0e0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  border-left: 1px solid #2a2a4a;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.5);
  transition: right 0.25s ease;
  overflow: hidden;
}
#chat-sidebar.open {
  right: 0;
}

.cs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #16213e;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
}
.cs-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.3px;
}
.cs-close {
  background: none;
  border: none;
  color: #888;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.cs-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.cs-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cs-messages::-webkit-scrollbar {
  width: 4px;
}
.cs-messages::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 2px;
}

.cs-msg {
  padding: 8px 12px;
  border-radius: 8px;
  max-width: 90%;
  line-height: 1.4;
  word-wrap: break-word;
}
.cs-msg-user {
  align-self: flex-end;
  background: #7c4dff;
  color: #fff;
}
.cs-msg-agent {
  align-self: flex-start;
  background: #16213e;
  color: #e0e0e0;
  border: 1px solid #2a2a4a;
}
.cs-msg-system {
  align-self: center;
  background: transparent;
  color: #666;
  font-size: 11px;
  font-style: italic;
}

.cs-input-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  background: #0f0f23;
  border-top: 1px solid #2a2a4a;
  flex-shrink: 0;
}
.cs-input {
  flex: 1;
  padding: 8px 12px;
  background: #1a1a2e;
  color: #e0e0e0;
  border: 1px solid #2a2a4a;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}
.cs-input:focus {
  border-color: #7c4dff;
}
.cs-input:disabled {
  opacity: 0.5;
}
.cs-send {
  width: 36px;
  height: 36px;
  padding: 0;
  background: #7c4dff;
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cs-send:hover {
  background: #6a3de8;
}
.cs-send:disabled {
  opacity: 0.5;
  cursor: default;
}

.cs-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: #0f0f23;
  border-top: 1px solid #2a2a4a;
  flex-shrink: 0;
  font-size: 10px;
  color: #555;
}
.cs-status-connected {
  color: #4caf50;
}
.cs-status-processing {
  color: #ff9800;
}
.cs-status-disconnected {
  color: #ff4444;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/chat-sidebar/ public/style.css
git commit -m "feat: chat sidebar UI with SSE streaming and action execution"
```

---

### Task 10: CompositionScreen Integration

**Files:**
- Modify: `src/app/screens/main/CompositionScreen.ts`

- [ ] **Step 1: Wire CompositionAPI, AgentActionHandler, ChatSidebar**

Update imports and constructor:

```ts
import { CompositionAPI } from "../../composition-api/CompositionAPI";
import { ChatSidebar } from "../../chat-sidebar/ChatSidebar";
```

Add to class fields:
```ts
private compositionAPI: CompositionAPI;
private chatSidebar: ChatSidebar;
```

In constructor, after creating layers, replace SceneBuilder creation:
```ts
this.compositionAPI = new CompositionAPI(
  this.background,
  this.assetLayer,
  this.fixedLayer,
  this.statusOverlay,
  this.webcam,
  this.textOverlay,
  this.currentProject,
);
this.sceneBuilder = new SceneBuilder(this.compositionAPI);
this.chatSidebar = new ChatSidebar(this.compositionAPI);
```

Add P key handler in `setupKeyboard()`:
```ts
if (event.code === "KeyP") {
  event.preventDefault();
  this.chatSidebar?.toggle();
}
```

Update `switchProject` to sync API:
```ts
private async switchProject(name: string) {
  _activeProject = name;
  await this.hide();
  this.currentProject = name;
  this.spawner.setProject(name);
  this.textOverlay.setProject(name);
  this.compositionAPI.setProject(name);
  this.sceneBuilder?.setProject(name);
  this.fixedLayer.clear();
  this.background.removeChildren();
  await this.prepare();
  await this.show();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Verify ESLint passes**

Run: `npm run lint`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/screens/main/CompositionScreen.ts
git commit -m "feat: integrate CompositionAPI, ChatSidebar, P key binding"
```

---

## Self-Review

**Spec coverage:**
- ✅ `.env.example` — Task 1
- ✅ `.gitignore` update — Task 1
- ✅ `package.json` deps + scripts — Task 1
- ✅ Vite proxy — Task 1
- ✅ `server/index.ts` — Task 2
- ✅ `server/services/llm.ts` — Task 2
- ✅ `server/services/chroma.ts` — Task 2
- ✅ `server/services/embed.ts` — Task 3
- ✅ `server/scripts/embed-assets.ts` — Task 3
- ✅ `server/system-prompt.ts` — Task 4
- ✅ `server/types.ts` — Task 4
- ✅ `server/routes/chat.ts` — Task 5
- ✅ `server/routes/assets.ts` — Task 5
- ✅ `server/routes/projects.ts` — Task 5
- ✅ `src/app/composition-api/CompositionAPI.ts` — Task 6
- ✅ `src/app/composition-api/AgentActionHandler.ts` — Task 7
- ✅ `src/app/scene-builder/SceneBuilder.ts` refactor — Task 8
- ✅ `src/app/chat-sidebar/ChatSidebar.ts` — Task 9
- ✅ Chat sidebar CSS — Task 9
- ✅ `src/app/screens/main/CompositionScreen.ts` integration — Task 10
- ✅ `server/tsconfig.json` — Task 2
- ✅ Guardrails (validateAlias, server-side project check, no project switching) — Tasks 5, 6, 7
- ✅ P key binding — Task 10

**Placeholder scan:** No TBD, TODO, or "implement later" found. All code blocks are complete.

**Type consistency:** `AgentAction` type defined in `server/types.ts` (Task 4) and re-defined locally in `AgentActionHandler.ts` (Task 7) since they run in different processes (Bun vs browser). `LayerId` type is consistent across `CompositionAPI.ts` and `AgentActionHandler.ts`. `CompositionAPI` interface matches what `ChatSidebar` and `SceneBuilder` consume. `ActionResult` type used consistently in ChatSidebar.
