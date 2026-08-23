<!-- caveman-begin -->
Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
<!-- caveman-end -->

## Project Overview
Vortex — PixiJS v8 real-time video composition engine. Layers: background (video/image), asset (floating pool via AssetSpawner), fixed (persistent decor via FixedAssetLayer), status (StatusOverlay hearts/xp), webcam (WebcamAsset with presets), text (TextOverlay phrases). All mutations via unified CompositionAPI (src/app/composition-api/CompositionAPI.ts). Agent actions executed via AgentActionHandler, UI via SceneBuilder (M key) and ChatSidebar (P key, SSE to Bun server). Server uses LM Studio LLM + ChromaDB semantic asset search.

## Project Structure
```
src/app/composition-api/  CompositionAPI.ts, AgentActionHandler.ts  # single mutation path
src/app/chat-sidebar/    ChatSidebar.ts (P key, SSE /api/chat)
src/app/scene-builder/   SceneBuilder.ts, filterPresets.ts, SceneState.ts
src/app/screens/main/composition/  BackgroundLayer, FixedAssetLayer, TextOverlay, StatusOverlay, WebcamAsset, AssetSpawner
src/engine/               engine.ts, audio, navigation
server/                   index.ts, routes/chat.ts|assets.ts|projects.ts, services/llm.ts|chroma.ts, system-prompt.ts, filter-presets.ts
projects/<name>/          assets/, backgrounds/, fix/, texts/, voices/, project.json
docs/superpowers/         specs/, plans/  # oneshot pipeline artifacts
public/                   built assets via AssetPack
opencode.json             project opencode config (default model lmstudio/qwen3.6-35b)
```

## Default Tool: opencode
- opencode is primary agent. Config: `opencode.json` at project root (checked in) + `~/.config/opencode/opencode.json` (global).
- Model default: `lmstudio/qwen3.6-35b-a3b-claude-4.7-opus-reasoning-distilled-apex` via LM Studio at http://127.0.0.1:1234/v1
- Skills paths use linux home `/home/dennis/.cache/...` (not /Users/...)
- Run via `opencode` / `bunx opencode` . Verify with `opencode --help`.

## Tool Preferences
- Use `rg` (ripgrep) instead of grep, `fd` instead of find, `bun` over npm/yarn.
- MCP servers: context7 (docs), filesystem (/home/dennis/work,/tmp), chrome-devtools (visual verification), caveman-shrink.

## Verification Protocol
Before declaring any task complete, you MUST verify:
- Run/build code — did it work?
- Trigger exact feature changed — did it behave correctly?
- Check for error messages in output
- Would you bet actual money this works?

Red flags — never say: "This should work now", "Try it now" (without trying), "The logic is correct so..."

## How to Run
```bash
bun install
bun run dev        # Vite :8080, proxies /api → :3001
bun run server     # Bun server :3001 (needs LM Studio + ChromaDB)
bun run embed-assets  # one-shot ChromaDB indexing
bun tsc --noEmit; bun run lint; vite build
```

## Instructions & Skills
- Instructions loaded: AGENTS.md + caveman SKILL.md
- Superpowers skills: brainstorming, writing-plans, subagent-driven-development, test-driven-development, verification-before-completion, etc.
- PixiJS skills under .opencode/skills/pixijs-*
- Loop plugin: /loop <task>

## Security & Boundaries
- NEVER read .env, printenv, sudo, secrets
- NEVER rm -rf, gh delete/org/secret
- ALWAYS ask before bun add
- External dir: ~/work/**, ~/.config/opencode/**, /tmp/** allowed

## System Prompt Reference
Server prompt builder: `server/system-prompt.ts` → `buildSystemPrompt(project, assets, backgrounds, filterPresets, state)` . Includes project structure, available tools (CompositionAPI + MCP), all AgentAction types (placeAsset/moveAsset/removeAsset/setFilter/clearFilter/setLayerVisibility/setBackground/nextBackground/setWebcamPreset/toggleWebcam/setTextIndex/nextText/setTextPosition/saveState/loadState/deleteState/searchAssets/createProject), injected asset lists, rules, and 4 examples (add/move/filter/search). Keep in sync with `server/types.ts` and `server/filter-presets.ts`.

