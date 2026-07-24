# Agentic Vortex — AI-Powered Composition Engine

## Overview

Add an AI agent layer to Vortex that enables natural-language control of scene composition via a Bun backend server, LM Studio LLM, ChromaDB semantic asset search, and a chat sidebar UI. All agent actions flow through a unified `CompositionAPI` that is also used by the existing SceneBuilder, ensuring a single code path for both human and agent interactions.

## Environment Configuration

**`.env.example`** (new file at project root):

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

# Client (Vite dev server proxy target)
VITE_VORTEX_SERVER_URL=http://localhost:3001
```

**`.env`** — same keys, user overrides locally. `.env` gitignored, `.env.example` committed.

**Vite proxy** — `vite.config.ts` proxies `/api/*` to `VITE_VORTEX_SERVER_URL` so browser makes same-origin requests.

## Architecture

```
Browser (Vite dev server :8080)          Bun Server (:3001)
┌──────────────────────────┐            ┌──────────────────────┐
│  ChatSidebar (P key)     │──POST /api/chat──▶│  routes/chat.ts     │
│  SceneBuilder (M key)    │            │    └─▶ services/llm.ts│
│  CompositionAPI          │◀─SSE stream─│    └─▶ services/chroma│
│    └─▶ PixiJS layers     │            │  routes/assets.ts     │
│  AgentActionHandler      │            │  routes/projects.ts   │
└──────────────────────────┘            └──────────────────────┘
```

## New Files

| File | Purpose |
|------|---------|
| `src/app/composition-api/CompositionAPI.ts` | Unified action layer |
| `src/app/composition-api/AgentActionHandler.ts` | Validates + executes agent JSON actions |
| `src/app/chat-sidebar/ChatSidebar.ts` | Chat UI panel (P key) |
| `src/app/chat-sidebar/chat-sidebar.css` | Chat panel styles |
| `server/index.ts` | Bun.serve() entry point |
| `server/routes/chat.ts` | POST /api/chat → SSE stream |
| `server/routes/assets.ts` | GET /api/assets/search, /api/assets/list |
| `server/routes/projects.ts` | GET /api/projects, POST /api/projects |
| `server/services/llm.ts` | LM Studio client (adapted from silicon-seeds) |
| `server/services/chroma.ts` | ChromaDB client (adapted from silicon-seeds) |
| `server/services/embed.ts` | Asset embedding pipeline |
| `server/system-prompt.ts` | Agent system prompt builder |
| `server/scripts/embed-assets.ts` | One-shot embed script |
| `server/tsconfig.json` | Server-side TypeScript config |
| `.env.example` | Environment variable template |

## Modified Files

| File | Change |
|------|--------|
| `src/app/scene-builder/SceneBuilder.ts` | Refactor to use CompositionAPI instead of direct container manipulation |
| `src/app/screens/main/CompositionScreen.ts` | Add CompositionAPI instance, P key handler, AgentActionHandler |
| `vite.config.ts` | Add `/api` proxy to Bun server |
| `package.json` | Add `server` script, dependencies (chromadb, @lmstudio/sdk) |
| `.gitignore` | Add `.env`, `chroma-data/` |

## CompositionAPI Interface

```ts
type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

interface CompositionAPI {
  placeAsset(alias: string, x: number, y: number, layer: "asset" | "fixed", scale?: number): Promise<boolean>;
  removeAsset(alias: string, layer: "asset" | "fixed"): boolean;
  setFilter(layer: LayerId, preset: string, intensity?: number): boolean;
  clearFilter(layer: LayerId): boolean;
  setLayerVisibility(layer: LayerId, visible: boolean): void;
  setBackground(alias: string): Promise<boolean>;
  nextBackground(): void;
  setWebcamPreset(index: number): void;
  toggleWebcam(): void;
  setTextIndex(index: number): void;
  nextText(): void;
  setTextPosition(x: number, y: number): void;
  saveState(name: string): SceneState;
  loadState(nameOrIndex: string | number): Promise<boolean>;
  deleteState(nameOrIndex: string | number): boolean;
  getState(): SerializedCompositionState;
  getCurrentProject(): string;
  getAvailableAssets(): AssetInfo[];
  getLoadedAssets(): AssetInfo[];
  getFilterPresets(): string[];
}
```

## Agent Action Schema

```ts
type AgentAction =
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
```

## Server Routes

| Route | Method | Body/Query | Response |
|-------|--------|------------|----------|
| `/api/chat` | POST | `{ message, project, state }` | SSE stream: `{ actions: AgentAction[], explanation: string }` |
| `/api/assets/search` | GET | `?q=...&project=...&limit=10` | `{ results: [{ id, path, project, type, score }] }` |
| `/api/assets/list` | GET | `?project=...` | `{ assets: [{ alias, type }] }` |
| `/api/projects` | GET | — | `{ projects: string[] }` |
| `/api/projects` | POST | `{ name, language }` | `{ success, path }` |

## Chat Sidebar UI

- Toggled by **P key**, independent of SceneBuilder (M key)
- Right-side panel, similar visual style to SceneBuilder
- Message list (scrollable), input field, send button
- SSE connection to `/api/chat` for streaming agent responses
- Shows executed actions inline with results (✓/✗)
- Connection status indicator (connected/disconnected)
- Styled via new `chat-sidebar.css`

## Guardrails

1. **CompositionAPI** validates every alias starts with `${currentProject}/`
2. **Server** validates returned actions against the project in the request
3. **No filesystem access** outside `projects/${currentProject}/`
4. **Agent cannot switch projects** — `switchProject` not exposed in action schema
5. **Agent cannot modify files** — only composition state (positions, filters, visibility)

## Asset Embedding Pipeline

`server/scripts/embed-assets.ts`:
1. Walks `projects/*/assets/` and `projects/*/backgrounds/`
2. Builds document: `"filename. Type: image|video|gif. Project: name. Path: assets/filename.png"`
3. Calls LM Studio embedding model
4. Upserts into ChromaDB collection with metadata `{ project, path, type, filename }`
5. Idempotent — skips already-embedded IDs

Runs at server startup (non-blocking) or via `POST /api/assets/embed`.

## Implementation Order

1. **CompositionAPI** — extract from SceneBuilder, unify interface
2. **SceneBuilder refactor** — use CompositionAPI
3. **AgentActionHandler** — JSON action validation + execution
4. **Bun server scaffold** — routes, LLM client, ChromaDB client
5. **Chat sidebar UI** — HTML panel, SSE client, P key binding
6. **System prompt** — Vortex rules + action schema + project context
7. **Asset embedding** — script + startup hook
8. **Integration testing** — end-to-end chat → action → scene update

## Non-Goals

- No video recording (OBS handles that)
- No WebLLM or client-side models
- No multi-user support
- No automatic storyboard generation (future)
- No voice/audio agent control (future)
- No asset upload UI
