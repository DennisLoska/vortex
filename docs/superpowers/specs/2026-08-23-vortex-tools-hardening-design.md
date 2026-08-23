# Vortex Tools Hardening — Design Spec

## Overview
Harden all 17+ CompositionAPI agent tools against LLM hallucination and validation gaps. Failing example: `removeAsset { alias: "faery/fix/hearts.png", layer:"fixed" }` → `Asset not found` because LLM invents extension while real file exists with different case/extension. Similar fragility affects every alias- and preset-taking tool. Fix via alias/filter/layer normalization + prompt hardening + server-side correction + client fuzzy fallback + structured error suggestions.

## Context
Project uses unified CompositionAPI (src/app/composition-api/CompositionAPI.ts) + AgentActionHandler.ts on client, server system prompt (server/system-prompt.ts) + chat route (server/routes/chat.ts) + types (server/types.ts) on server. LLM (opencode via :4096, model opencode-go/ox-alpha-free, config opencode.json) receives injected Available Assets/Backgrounds/FilterPresets/Current State and must return exact aliases. Despite prompt rule "ONLY use aliases from lists above. Never invent aliases", LLM still hallucinates extensions, casing, subdir names, filter casing. All tools should tolerate minor variance and guide LLM to canonical values rather than hard-fail with opaque message.

## Problem
- **Alias fragility**: placeAsset/moveAsset/removeAsset/setBackground accept alias string; exact `child.label === alias` or `Assets.load(alias)` required. LLM frequently emits wrong extension (.png vs .gif), wrong case, omits extension, uses basename only, confuses `fix` vs `fixed` subdir, or drops project prefix. Client returns `false` → handler returns `Asset not found: X` with no hint. No server-side alias correction before forwarding to client.
- **Background alias**: same fragility; `setBackground` validated only by prefix check, no canonicalization, `BackgroundLayer.setBackground` fails on miss.
- **Filter preset fragility**: `setFilter` checks `FILTER_PRESETS.find(p=>p.name===presetName)` exact. LLM may emit `grayscale`, `Grayscale `, `gray-scale`, or intensity as string. Returns `Unknown filter` no suggestions.
- **Layer fragility**: all layer-bearing tools validate exact `background|asset|fixed|status|webcam`. LLM may send `fix`, `Fixed`, `Background` with wrong case. Filtered out in chat route or failed in handler with generic `Invalid layer`.
- **Numeric bounds**: setWebcamPreset clamps internally, setTextIndex mods, but handler gives no validation/error for out-of-range; silent wrap-around confusing. Coordinates x/y not clamped to 0..1920/0..1080, scale not clamped 0.1..2.
- **State tools**: saveState allows duplicate names; load/delete by nameOrIndex ambiguous (string numeric vs index). getState returns large JSON with no truncation. deleteState silently false on miss.
- **Server stubs**: searchAssets/createProject in ActionHandler are no-ops strings; actual search is handled via separate LLM structured-then-Chroma searchCheck in chat route — disjoint from action execution path, not exercised by handler tests.
- **Prompt**: says "alias must be exact" but does not enumerate canonical-alias normalization, does not show fix/fixed distinction strongly, does not list `getState` truncation, does not stress to copy alias verbatim including extension and case. List rendering (`- ${project}/fix/hearts.png (image)`) is correct but LLM still generalizes pattern.

## Goals
- Every alias-taking tool tolerates: wrong extension, missing extension, case variance, basename-only, `fix`/`fixed` alias confusion, extra whitespace, and resolves to canonical alias when unique basename matches; ambiguous basename returns helpful `Did you mean …?` suggestions.
- Every filter-taking tool tolerates case/whitespace variance, trims, maps `grey`→`Grayscale`, `gray`→`Grayscale`, hyphen/space variance, and suggests closest preset on miss.
- Every layer-taking tool normalizes case/trim and maps `fix`→`fixed`; suggests valid layers on miss.
- Numeric params clamped/validated with clear ok message (e.g., `Webcam preset 99 clamped to 13`).
- Server chat route corrects aliases before sending to client (canonicalize + filter suggestion), never forwards hallucinated alias if resolvable.
- System prompt hardened: stronger verbatim-copy rule, explicit "copy including extension and case", fix/fixed warning box, filter normalization note, coordinate bounds, and example with extension.
- Client retains exact-match fast path; fuzzy is fallback, deterministic, tested.
- All 19 actions verified: placeAsset, moveAsset, removeAsset, setFilter, clearFilter, setLayerVisibility, setBackground, nextBackground, setWebcamPreset, toggleWebcam, setTextIndex, nextText, setTextPosition, saveState, loadState, deleteState, getState, searchAssets, createProject.

## Non-Goals
- No new LLM model, no embedding model change.
- No new project type; createProject filesystem behavior unchanged beyond alias fix integration.
- No UI for manual asset upload.
- No multi-user auth.

## Approaches Considered

### A. Shared Resolver + Server Correction + Prompt Hardening (RECOMMENDED)
Central alias/filter/layer resolver utilities (shared src/utils or server/utils + client/utils with identical logic). Client CompositionAPI/AgentActionHandler use resolver for fuzzy fallback after exact miss. Server chat route runs same resolver against filesystem-derived canonical lists before sending actions to client, rewriting hallucinated aliases to canonical when unique. System prompt reinforced with verbatim-copy instruction + fix/fixed callout + normalization disclosure. Pros: single source of truth, defends at both ends, deterministic, testable, backwards-compatible (exact still works). Cons: resolver must stay in sync between server and client (solved by shared file or duplication with test parity).

### B. Strict Rejection + Helpful Error Retry (rejected)
Keep exact matching, but improve error messages to list closest candidates and require LLM to retry via second turn. Pros: simple, no fuzzy magic. Cons: requires extra LLM round-trip, slower UX, still fails first attempt, increases token cost, user sees warning “1 action(s) failed”.

### C. Embedding Search Fallback for Every Alias Tool (rejected)
On alias miss, call Chroma semantic search to find closest asset and auto-use top hit. Pros: handles semantic vagueness (“hearts gif”). Cons: heavy (embedding call per tool), non-deterministic, may pick wrong asset (white_line_churn_heart vs hearts), adds latency, overkill for trivial extension typo.

## Architecture

### 1. Shared Resolver Module
Create `src/app/composition-api/aliasResolver.ts` (client) and `server/utils/aliasResolver.ts` (server) with identical exported functions, or single `src/utils/aliasResolver.ts` importable from both (Bun handles TS). Functions:

- `normalizeAlias(alias:string):string` — trim, collapse whitespace.
- `resolveAssetAlias(requested:string, available:string[]):{alias:string|null, suggestion:string[], didYouMean?:string}` — exact → return; case-insensitive exact → return canonical; strip ext and match basename → if unique, return canonical; if multiple (e.g., `hearts` matches `hearts.png` + `hearts.gif`), return null + suggestions; strip project prefix handling; fix↔fixed alias handling (`/fix/` in path vs layer `fixed`); whitespace/case variants.
- `resolveFilterPreset(requested:string, presets:string[]):{preset:string|null, suggestion:string[]}` — trim, case-insensitive exact → canonical; normalize hyphens/spaces/underscore, map `grey→gray` synonym (`grey`→`Grayscale` alias), `gray scale`→`Grayscale`, etc.; Levenshtein distance ≤2 suggests closest.
- `resolveLayer(requested:string):{layer:LayerId|null, suggestion:LayerId[]}` — trim lower-case, map `fix→fixed`, `backgrounds→background`, etc.
- `clampCoord(v:number,bound:number):number`, `clampScale(s:number):number`, `clampIntensity(p:number):number`.
- Pure functions, no I/O, unit-tested.

Client `CompositionAPI.placeAsset/removeAsset/moveAsset/getLayerAssets` and `BackgroundLayer.setBackground` will call resolver before exact match. Server `handleChat` validActions mapping will rewrite aliases using resolver before forwarding.

### 2. Client Changes
- `CompositionAPI.ts`:
  - Add `resolveAliasOrSuggest(alias:string, layer?:"asset"|"fixed"|"background"): string|null` helper using runtime available aliases from AssetManifest or current children labels as fallback.
  - `placeAsset`: normalize alias, validate via `validateAlias` prefix after normalize, then attempt `Assets.load(normalized)` → if fails, try resolver against manifest list, then `Assets.load(canonical)`. Return bool; on failure, store last suggestion for handler message.
  - `removeAsset`/`moveAsset`: after exact `find(c=>c.label===alias)` miss, try `resolver.resolveAssetAlias` against `container.children.map(c=>c.label)`, then against `getProjectFixAssets`/`Assets` manifest; if single canonical found present in container, use it; else return false with suggestion message crafted by handler.
  - `setFilter`: normalize preset via resolver before lookup; if not found, return false but handler will surface suggestions.
  - `setLayerVisibility`/`setFilter`/`clearFilter`: normalize layer before `getLayerContainer`.
  - `setBackground`: normalize alias, resolver against `getProjectBackgrounds` list, then call `bgLayer.setBackground(canonical)`.
  - `setWebcamPreset`: clamp and return effective index for message.
  - `setTextIndex`: clamp/mod and return effective.
  - `setTextPosition`: clamp x 0..1920, y 0..1080.
  - Expose `getResolverDebug(): string` for getState? Not needed.
- `AgentActionHandler.ts`:
  - Extend fail messages to include suggestions: `Asset not found: X. Did you mean Y? Available: [...]`.
  - Normalize layer/preset/alias before calling API, using same resolvers where possible (or delegate to API and interpret boolean false as suggestion).
  - For `placeAsset`, include normalized alias in success message if corrected: `Placed X (resolved from Y)`.
  - For `setBackground`, same.
  - For `setFilter`, on failure include `Did you mean Grayscale? Available: ...`.
  - For `setWebcamPreset`/`setTextIndex`, clamp and report clamped value.
  - `searchAssets`/`createProject` remain server stubs but return consistent ok with hint: `use server via chat`.
  - Keep `VALID_LAYERS` but add `resolveLayer` before validation.

### 3. Server Changes
- `server/utils/aliasResolver.ts` (or shared): duplicate or import resolver.
- `server/routes/chat.ts`:
  - Extend `getProjectAssets`/`getProjectBackgrounds` to be used for correction; keep existing but also expose `resolveAssetAlias` correction pass in `validActions` filter: for each action with alias, attempt `resolveAssetAlias` against `assets`/`backgrounds` list; if resolved, rewrite `action.alias = canonical`; if ambiguous, keep original but annotate for error handling (or drop with explain?). Prefer rewrite when unique.
  - For `setFilter`, normalize preset via resolver; rewrite to canonical if found; else keep but annotate.
  - For layer fields, normalize via resolver; rewrite.
  - Keep prefix validation after normalization.
  - Ensure `actionSchema` remains permissive but add server-side normalization step before LLM structured validation? Already after LLM; correction post-LLM is fine.
  - Update `buildSystemPrompt` injection to ensure filter list comes from `FILTER_PRESET_NAMES` (already does) — no change needed there beyond prompt text.
- `server/system-prompt.ts`:
  - Strengthen rule 1: `Copy alias verbatim including extension and case — e.g., faery/fix/hearts.png not hearts.gif or Hearts.PNG. Alias path uses /fix/ for decor but layer param is "fixed". Do not invent extension. If unsure, use searchAssets then copy exact alias from search results.`
  - Add advisory: `Filter presets are case-insensitive on server (Grayscale == grayscale) but prefer canonical capitalization as listed.`
  - Add layer advisory: `Layer names lower-case; fix→fixed alias correction happens server-side but send "fixed".`
  - Keep examples but add one showing extension accuracy and one showing moveAsset with fix layer.
- `server/types.ts`: no schema change (already has all types). Verify zod `actionSchema` covers new normalization (no change).
- `server/filter-presets.ts`: already canonical 37 entries; add export `resolveFilterPreset` helper if centralizing.

### 4. Asset Manifest
`src/assetManifest.ts` already exposes `getProjectFixAssets`, `getProjectBackgrounds`, `getProjectAssets`. Ensure it lists real files with correct extensions (hearts.png). No change unless resolver needs manifest at runtime — already available.

### 5. Testing Strategy
Unit: `aliasResolver.test.ts` — exact, case-insensitive, wrong ext, missing ext, basename-only, fix/fixed, whitespace, ambiguous (multiple matches), no match. `filterResolver` — grayscale variants, hyphen, Levenshtein. `layerResolver` — fix→fixed.
Integration: `CompositionAPI.test.ts` mock containers, test place/remove/move with wrong ext resolves; setFilter case-insensitive; setBackground alias correction.
Handler: `AgentActionHandler.test.ts` — drive executeActions with hallucinated aliases and assert success with resolved message, unknown filter suggests, invalid layer normalized.
Server: `server/routes/chat.test.ts` — mock getProjectAssets, test chat validActions rewriting.
E2E manual: trigger “remove the hearts” via LLM mock (or direct handler call) and assert success.

## Data Flow
User utterance → ChatSidebar SSE → POST /api/chat {message, project, state} → server loads assets/backgrounds/presets → buildSystemPrompt → optional semantic search pre-check (Chroma) → LLM structured → raw actions → server correction pass (alias/filter/layer normalization against canonical lists) → Response SSE `actions` → ChatSidebar receives → AgentActionHandler.executeActions(api, actions) → client normalization fallback (children labels) → CompositionAPI mutation → result messages → UI toast + next turn.

## Error Handling
- Resolver returns null + suggestions on ambiguous/missing; handler turns into user-facing fail message with `Did you mean: a, b, c. Available: ...` truncated to 5.
- Numeric clamping always succeeds but message notes clamping: `Webcam preset 20 clamped to 13 (max 13).`
- saveState duplicate name allowed but logs: overwrites? Currently pushes; keep push but message OK; optional deduplicate by replacing existing same name.
- getState if large, truncate? Keep as-is but ensure handler does not double-JSON-stringify excessively.
- File system missing project dir → empty assets list, resolver yields no suggestion, prompt shows “(none)”.

## File Plan
- New: `src/utils/aliasResolver.ts` or `src/app/composition-api/aliasResolver.ts` and `server/utils/aliasResolver.ts` (shared or duplicated with test parity). Prefer single `src/app/composition-api/aliasResolver.ts` + server imports via relative path or duplicated copy to avoid Vite/Bun alias complexity.
- Edit: `src/app/composition-api/CompositionAPI.ts`, `src/app/composition-api/AgentActionHandler.ts`, `server/routes/chat.ts`, `server/system-prompt.ts`, `src/assetManifest.ts` (if needed), `server/filter-presets.ts`.
- Docs: `docs/superpowers/specs/2026-08-23-vortex-tools-hardening-design.md` (this), `docs/superpowers/plans/...`.

## Acceptance Criteria
- `removeAsset` with alias `faery/fix/hearts.gif` (wrong ext) or `hearts` (basename) or `HEARTS.PNG` (case) correctly removes `faery/fix/hearts.png` when unique; handler message `Removed faery/fix/hearts.png (resolved from faery/fix/hearts.gif)` and success true.
- `placeAsset`/`moveAsset`/`setBackground` same normalization.
- `setFilter` with `grayscale`, `GRAYSCALE`, `gray-scale`, `Grey` all resolve to `Grayscale`; unknown `Neon` yields `Unknown filter: Neon. Did you mean Glow? Available: None, Grayscale, …`.
- `setLayerVisibility`/`setFilter`/`clearFilter` with `Fix`, ` FIX `, `backgrounds` resolve to `fixed`/`background`.
- `setWebcamPreset` with index 99 clamped to 13, returns ok with clamped note; index -5 clamped to 0.
- `setTextIndex` with 999 wraps/mods correctly, ok.
- `setTextPosition` clamps to 0..1920/0..1080.
- `saveState/loadState/deleteState` duplicate name handling deterministic; load/delete by string numeric vs index disambiguated (string numeric treated as name first, index only if number type).
- Server correction pass rewrites hallucinated alias before client, verified by unit test.
- System prompt contains hardened verbatim-copy rule and fix/fixed warning, verified by buildSystemPrompt test.
- `bun tsc --noEmit`, `bun run lint`, `vite build` pass.
- New resolver unit tests pass.

## Open Questions
- Single shared resolver file vs duplicated client/server copy? Decide single source under `src/utils/` and have server import via relative path with Bun transpile; fallback duplicate if Vite alias issues.

