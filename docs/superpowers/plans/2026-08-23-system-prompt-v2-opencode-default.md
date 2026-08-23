# Plan — System Prompt v2 + Opencode Default + Verification

**Goal:** Make opencode default, rewrite system prompt to reference all tools/project structure, add missing moveAsset/clearFilter, verify via sub-agents + chrome-devtools visual.

**Tech:** Bun, PixiJS v8, LMStudio, ChromaDB, opencode config, chrome-devtools MCP

---

### Task 1 — Opencode Default Config

**Files:** `opencode.json` (create), `~/.config/opencode/opencode.json` (fix), `AGENTS.md` (create)

- [ ] Step 1: Create `opencode.json` at project root
  - $schema https://opencode.ai/config.json
  - model: `lmstudio/qwen3.6-35b-a3b` (matching .env LLM_MODEL)
  - provider lmstudio baseURL http://127.0.0.1:1234/v1
  - plugin: ["opencode-mem","./plugins/caveman/plugin.js","./plugins/loop/plugin.js","superpowers@git+https://github.com/obra/superpowers.git"]
  - skills.paths: ["/home/dennis/.cache/opencode/packages/superpowers@git+https:/github.com/obra/superpowers.git/node_modules/superpowers/skills"] (linux fix)
  - instructions: ["AGENTS.md","~/.config/opencode/skills/caveman/SKILL.md"]
  - mcp: context7, filesystem, chrome-devtools
  - permission: same as global but allow read glob etc
  - lsp: {}

- [ ] Step 2: Fix global `~/.config/opencode/opencode.json` skill path `/Users/dennisloska` → `/home/dennis`, ensure provider models include qwen3.6-35b
- [ ] Step 3: Create `AGENTS.md` at project root
  - Sections: Project overview (Vortex PixiJS composition engine), Structure (src/app/*, server/*, projects/*, docs/superpowers/*), Tools (bun over npm, rg/fd, pixi.js, lmstudio, chroma), Instructions (opencode default, caveman, verification protocol), How to run (bun dev, bun server, embed-assets), MCP usage
- [ ] Step 4: Ensure `.gitignore` keeps `.opencode/` ignored but `opencode.json` is tracked
- [ ] Step 5: Commit task 1

---

### Task 2 — CompositionAPI moveAsset + Types + Handler

**Files:** `src/app/composition-api/CompositionAPI.ts`, `server/types.ts`, `src/app/composition-api/AgentActionHandler.ts`, `server/routes/chat.ts`

- [ ] Step 1: Add `moveAsset(alias, x, y, layer)` to CompositionAPI.ts
  - Find child by label in fixed/asset layer, set x,y, return bool
- [ ] Step 2: Add to `server/types.ts` AgentAction union:
  - `{ type: "moveAsset"; alias: string; x: number; y: number; layer: "asset"|"fixed" }`
  - `{ type: "clearFilter"; layer: LayerId }`
- [ ] Step 3: Update `src/app/composition-api/AgentActionHandler.ts`
  - handle `moveAsset` → api.moveAsset
  - handle `clearFilter` → api.clearFilter
  - keep existing setFilter handling additive
- [ ] Step 4: Update `server/routes/chat.ts` actionSchema z.object to include moveAsset fields (x,y,alias,layer) and clearFilter
- [ ] Step 5: Commit task 2

---

### Task 3 — Centralize Filter Presets + Rewrite System Prompt

**Files:** `server/system-prompt.ts`, `server/filter-presets.ts` (new), `server/routes/chat.ts` (refactor to use it)

- [ ] Step 1: Create `server/filter-presets.ts` exporting const FILTER_PRESET_NAMES: string[] (mirrors src/app/scene-builder/filterPresets.ts names, 38 entries)
- [ ] Step 2: Update `server/routes/chat.ts` to import FILTER_PRESET_NAMES instead of hardcoded array
- [ ] Step 3: Rewrite `server/system-prompt.ts` buildSystemPrompt to v2:
  - Params same but output new structure:
    - Header: role + opencode default
    - Project Structure block
    - Available Tools block (CompositionAPI + MCP)
    - Available Actions with JSON examples per type (include moveAsset, clearFilter)
    - Injected Available Assets / Backgrounds / Filter Presets / Current State
    - Rules (alias must start with project/, coordinates, JSON return, etc)
    - Examples section (4 examples): add asset, move asset, change filter, search+place
  - Ensure length < 4k tokens but covers all
- [ ] Step 4: Commit task 3

---

### Task 4 — Verification: tsc/lint/build + Sub-agent prompt tests

**Files:** verification scripts (tmp)

- [ ] Step 1: Run `bun tsc --noEmit` + `bun run lint` + `vite build` — must pass
- [ ] Step 2: Spawn 3 sub-agents (investigator style) to test:
  - Agent A: system prompt contains moveAsset + project structure + examples → PASS/FAIL
  - Agent B: CompositionAPI moveAsset works + handler executes → PASS/FAIL
  - Agent C: opencode config valid + default model + skill path linux correct → PASS/FAIL
- [ ] Step 3: If any fail → fix + re-run

---

### Task 5 — Visual Verification via chrome-devtools MCP

**Files:** none (runtime check)

- [ ] Step 1: `bun run build` then `bun run dev` in background, also `bun run server` if needed
- [ ] Step 2: Use chrome-devtools to navigate to http://localhost:8080, take snapshot, take screenshot
- [ ] Step 3: Trigger CompositionAPI actions via devtools evaluate: placeAsset, moveAsset, setFilter, then screenshot again
- [ ] Step 4: Verify visually assets moved/filters applied, snapshot shows canvas children

---

### Task 6 — PR + Finish (Phase 5-7)

- [ ] Push branch `feat/agentic-scene-builder` (already exists) or new branch `feat/system-prompt-v2`
- [ ] Create PR if not exists, update PR 7 description
- [ ] Tag oneshot/phase-* for new work

