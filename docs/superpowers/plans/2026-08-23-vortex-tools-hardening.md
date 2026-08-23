# Vortex Tools Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden all 19 vortex tools against LLM hallucination via alias/filter/layer normalization and server correction so wrong-extension/wrong-case aliases resolve when unique.

**Architecture:** Shared pure-function resolvers (alias/filter/layer + clamping) used at both client (CompositionAPI fallback) and server (chat route correction pass) plus system-prompt hardening; exact-match remains fast path, fuzzy fallback with suggestions.

**Tech Stack:** Bun 1.3, PixiJS v8, TypeScript, Zod, opencode toolchain, Chroma, Vite.

---

## Task 1: Alias / Filter / Layer Resolver Utilities + Unit Tests

**Files:**
- Create: `src/app/composition-api/aliasResolver.ts`
- Create: `server/utils/aliasResolver.ts`
- Create: `tests/aliasResolver.test.ts` (or `src/app/composition-api/aliasResolver.test.ts` for Bun)
- Modify: `server/filter-presets.ts` (export helper if needed)

- [ ] **Step 1: Write the failing test for aliasResolver**

```ts
// tests/aliasResolver.test.ts
import { describe, it, expect } from "bun:test";
import { resolveAssetAlias, resolveFilterPreset, resolveLayer, clampCoord, clampScale, clampIntensity } from "../src/app/composition-api/aliasResolver";
import { FILTER_PRESET_NAMES } from "../server/filter-presets";

describe("resolveAssetAlias", () => {
  const available = ["faery/fix/hearts.png", "faery/fix/hearts.gif", "faery/fix/navi.gif", "faery/assets/cloud.png", "faery/backgrounds/bg.mp4"];
  it("exact match", () => { expect(resolveAssetAlias("faery/fix/hearts.png", available).alias).toBe("faery/fix/hearts.png"); });
  it("wrong extension unique basename", () => {
    const avail2 = ["faery/fix/hearts.png", "faery/fix/navi.gif"];
    expect(resolveAssetAlias("faery/fix/hearts.gif", avail2).alias).toBe("faery/fix/hearts.png");
  });
  it("case insensitive", () => { expect(resolveAssetAlias("FAERY/FIX/HEARTS.PNG", ["faery/fix/hearts.png"]).alias).toBe("faery/fix/hearts.png"); });
  it("basename only -> suggests if multiple", () => {
    const r = resolveAssetAlias("hearts", ["faery/fix/hearts.png", "faery/fix/hearts.gif"]);
    expect(r.alias).toBeNull(); expect(r.suggestion.length).toBe(2);
  });
  it("missing extension", () => { expect(resolveAssetAlias("faery/fix/hearts", ["faery/fix/hearts.png"]).alias).toBe("faery/fix/hearts.png"); });
  it("fix/fixed confusion", () => { expect(resolveAssetAlias("faery/fixed/hearts.png", ["faery/fix/hearts.png"]).alias).toBe("faery/fix/hearts.png"); });
});

describe("resolveFilterPreset", () => {
  it("case insensitive", () => { expect(resolveFilterPreset("grayscale", [...FILTER_PRESET_NAMES]).preset).toBe("Grayscale"); });
  it("hyphen", () => { expect(resolveFilterPreset("gray-scale", [...FILTER_PRESET_NAMES]).preset).toBe("Grayscale"); });
  it("unknown suggests", () => { const r = resolveFilterPreset("Neon", [...FILTER_PRESET_NAMES]); expect(r.preset).toBeNull(); expect(r.suggestion.length).toBeGreaterThan(0); });
});

describe("resolveLayer", () => {
  it("fix->fixed", () => { expect(resolveLayer("fix").layer).toBe("fixed"); });
  it("case trim", () => { expect(resolveLayer(" FIX ").layer).toBe("fixed"); });
  it("invalid", () => { expect(resolveLayer("bogus").layer).toBeNull(); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/aliasResolver.test.ts`
Expected: FAIL — file not found / function not defined

- [ ] **Step 3: Write minimal resolver implementation (client)**

```ts
// src/app/composition-api/aliasResolver.ts
export type LayerId = "background"|"asset"|"fixed"|"status"|"webcam";
const VALID: LayerId[] = ["background","asset","fixed","status","webcam"];

export function normalizeAlias(s:string){ return s.trim(); }
function basenameNoExt(s:string){ const f=s.split("/").pop()||""; const dot=f.lastIndexOf("."); return dot>-1?f.slice(0,dot):f; }
function ext(s:string){ const m=s.toLowerCase().match(/\.[a-z0-9]+$/); return m?m[0]:""; }

export function resolveAssetAlias(req:string, avail:string[]){
  const n = normalizeAlias(req);
  if(avail.includes(n)) return {alias:n, suggestion:[] as string[]};
  const low = n.toLowerCase();
  const ci = avail.find(a=>a.toLowerCase()===low);
  if(ci) return {alias:ci, suggestion:[]};
  // try fix<->fixed alias normalization in path
  const fixedPath = n.replace("/fixed/","/fix/").replace("/fix/","/fix/");
  const fixCi = avail.find(a=>a.toLowerCase()===fixedPath.toLowerCase());
  if(fixCi) return {alias:fixCi, suggestion:[]};
  // basename without ext matching unique
  const base = basenameNoExt(n).toLowerCase();
  const withoutExtMatches = avail.filter(a=>basenameNoExt(a).toLowerCase()===base);
  if(withoutExtMatches.length===1) return {alias:withoutExtMatches[0], suggestion:[]};
  if(withoutExtMatches.length>1) return {alias:null, suggestion: withoutExtMatches.slice(0,5)};
  // strip extension and compare
  const candidates = avail.filter(a=>{
    const b = basenameNoExt(a).toLowerCase();
    return b===base;
  });
  if(candidates.length===1) return {alias:candidates[0], suggestion:[]};
  // closest by includes
  const includes = avail.filter(a=>a.toLowerCase().includes(base));
  if(includes.length>0 && includes.length<=3) return {alias:null, suggestion:includes.slice(0,5)};
  return {alias:null, suggestion: avail.slice(0,5)};
}
export function resolveFilterPreset(req:string, presets:string[]){
  const n=req.trim();
  const ci=presets.find(p=>p.toLowerCase()===n.toLowerCase());
  if(ci) return {preset:ci, suggestion:[]};
  const norm=(s:string)=>s.toLowerCase().replace(/[-_\s]+/g,"").replace("grey","gray");
  const nn=norm(n);
  const found=presets.find(p=>norm(p)===nn);
  if(found) return {preset:found, suggestion:[]};
  // alias map
  if(nn==="gray"||nn==="grayScale"||nn==="grayscale") {
    const g=presets.find(p=>p==="Grayscale"); if(g) return {preset:g, suggestion:[]};
  }
  // levenshtein suggestion
  const scored=presets.map(p=>({p, d: levenshtein(nn, norm(p))})).sort((a,b)=>a.d-b.d);
  const best=scored[0];
  if(best && best.d<=2) return {preset:null, suggestion:[best.p, ...scored.slice(1,2).map(s=>s.p)]};
  return {preset:null, suggestion: presets.slice(0,5)};
}
function levenshtein(a:string,b:string){ const m=[...Array(a.length+1)].map((_,i)=>i); for(let j=1;j<=b.length;j++){ let prev=m[0]; m[0]=j; for(let i=1;i<=a.length;i++){ const tmp=m[i]; m[i]=Math.min(m[i]+1,m[i-1]+1,prev+(a[i-1]===b[j-1]?0:1)); prev=tmp; } } return m[a.length]; }
export function resolveLayer(req:string){ const n=req.trim().toLowerCase(); if(n==="fix") return {layer:"fixed" as LayerId, suggestion:[]}; if(n==="backgrounds") return {layer:"background" as LayerId, suggestion:[]}; const found=VALID.find(v=>v===n); if(found) return {layer:found, suggestion:[]}; return {layer:null, suggestion:[...VALID]}; }
export function clampCoord(v:number,bound:number){ return Math.max(0,Math.min(bound, v)); }
export function clampScale(s:number){ return Math.max(0.1,Math.min(2, s)); }
export function clampIntensity(p:number){ return Math.max(0,Math.min(100,p)); }
```

Duplicate file server/utils/aliasResolver.ts identical logic (copy).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/aliasResolver.test.ts -v`
Expected: PASS all

- [ ] **Step 5: Commit**

```bash
git add src/app/composition-api/aliasResolver.ts server/utils/aliasResolver.ts tests/aliasResolver.test.ts
git commit -m "feat: alias/filter/layer resolvers with normalization and suggestions"
```

---

## Task 2: Harden CompositionAPI — Assets (place/move/remove/background)

**Files:**
- Modify: `src/app/composition-api/CompositionAPI.ts:84-160,220-230`
- Modify: `src/app/assetManifest.ts` (no change needed, just verify imports)

- [ ] **Step 1: Write failing handler-level test for wrong-extension remove**

```ts
// tests/composition.test.ts snippet
const api = new CompositionAPI(bgLayer, assetLayer, fixedLayer, statusLayer, webcam, textOverlay, "faery");
// populate fixedLayer with child label "faery/fix/hearts.png"
fixedLayer.addChild({label:"faery/fix/hearts.png"} as any);
expect(api.removeAsset("faery/fix/hearts.gif","fixed")).toBe(true); // should resolve
expect(api.removeAsset("hearts","fixed")).toBe(true); // ambiguous
```

- [ ] **Step 2: Run test fails**

Run: `bun test tests/composition.test.ts -v`
Expected: FAIL — remove returns false on wrong ext

- [ ] **Step 3: Implement minimal fix in CompositionAPI.ts**

In `placeAsset`: before Assets.load, normalize alias via aliasResolver, attempt resolve against `getProjectFixAssets(currentProject).concat(getProjectAssets(...).map(p=>p.key)).concat(getProjectBackgrounds(...).videoAliases.concat(...))` or against manifest; if resolved alias exists, use it. Keep original alias as label fallback but store canonical as label. For `removeAsset`/`moveAsset`: first exact find, if not found iterate `resolveAssetAlias` against `container.children.map(c=>c.label)` plus manifest list; if resolved label exists in container, use it. For `setBackground`: same resolve against backgrounds list before `bgLayer.setBackground`.

Add import: `import { resolveAssetAlias } from "./aliasResolver"; import { getProjectFixAssets, getProjectAssets, getProjectBackgrounds } from "../assetManifest";`

Wrap `placeAsset` alias param: `const resolved = resolveAssetAlias(alias, availableAliases); const canonical = resolved.alias ?? alias;` then `validateAlias(canonical)` and `Assets.load(canonical)`. On success `child.label = canonical;`

Similarly `removeAsset`: `let targetLabel = alias; const exact = container.children.find(c=>c.label===alias); if(!exact){ const availLabels = container.children.map(c=>c.label||"").filter(Boolean); const r = resolveAssetAlias(alias, availLabels.length?availLabels:availableAliases); if(r.alias) targetLabel=r.alias; }`

Clamp coords in `moveAsset`/`placeAsset`: `x = clampCoord(x,1920); y=clampCoord(y,1080); scale=clampScale(scale);`

- [ ] **Step 4: Run test passes**

Run: `bun test tests/composition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/composition-api/CompositionAPI.ts
git commit -m "fix: CompositionAPI asset alias normalization + coordinate/scale clamping"
```

---

## Task 3: Harden CompositionAPI — Filters / Layers / Webcam / Text + Numeric Clamping

**Files:**
- Modify: `src/app/composition-api/CompositionAPI.ts:159-260`
- Modify: `src/app/scene-builder/filterPresets.ts` (no change) / `server/filter-presets.ts` (add helper)

- [ ] **Step 1: Write failing test for filter/layer case insensitivity**

```ts
expect(api.setFilter("BACKGROUND","grayscale",80)).toBe(true);
expect(api.setFilter("fixed","gray-scale")).toBe(true);
api.setLayerVisibility("Fix", false); expect(fixedLayer.visible).toBe(false);
expect(api.setWebcamPreset(99)).toBe(13); // clamped
```

- [ ] **Step 2: Run failing**

Run: `bun test tests/composition-filter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

In `CompositionAPI.setFilter`: import `resolveFilterPreset`, `resolveLayer`. At top: `const layerNorm = resolveLayer(layer as string); if(!layerNorm.layer) return false; const l = layerNorm.layer;` then `const presetNorm = resolveFilterPreset(presetName, FILTER_PRESETS.map(p=>p.name)); const canonicalPreset = presetNorm.preset ?? presetName;` Use canonicalPreset for `controlState[l].currentFilter` and `FILTER_PRESETS.find`.

In `clearFilter` and `setLayerVisibility` and `getLayerContainer` and `adjustIntensity`: resolve layer via `resolveLayer` first.

In `setWebcamPreset`: clamp index 0..13: `const clamped = Math.max(0,Math.min(13, index)); this.webcam.setPreset(clamped); return clamped;`

In `setTextIndex`: clamp mod: `const len = textOverlay.phrases.length? ... : 1; const clamped = ((index%len)+len)%len;`

In `setTextPosition`: clamp x/y: `x=clampCoord(x,1920); y=clampCoord(y,1080);`

- [ ] **Step 4: Run passes**

Run: `bun test tests/composition-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/composition-api/CompositionAPI.ts
git commit -m "fix: CompositionAPI filter/layer case-insensitive + webcam/text clamping"
```

---

## Task 4: AgentActionHandler — Suggestions and Normalization

**Files:**
- Modify: `src/app/composition-api/AgentActionHandler.ts:1-204`

- [ ] **Step 1: Write failing handler test for suggestion messages**

```ts
import { executeActions } from "../src/app/composition-api/AgentActionHandler";
const res = await executeActions(mockApi, [{type:"removeAsset", alias:"faery/fix/hearts.gif", layer:"fixed"}]);
expect(res[0].success).toBe(true); expect(res[0].message).toContain("resolved");
const res2 = await executeActions(mockApi, [{type:"setFilter", layer:"background", preset:"neon"}]);
expect(res2[0].success).toBe(false); expect(res2[0].message).toContain("Did you mean");
```

- [ ] **Step 2: Run fail**

Run: `bun test tests/handler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

In `AgentActionHandler.ts`: import resolvers. For each case:

- `placeAsset`: resolve alias via `resolveAssetAlias` against mock available list? Instead delegate to API but intercept message: if api.placeAsset returns false and resolver suggests, fail message includes suggestion: `Asset not found: ${alias}. Did you mean ${suggestion}?`

Simplify: before calling api, try resolve locally using `api.getAvailableAssets()`+ `getProjectFixAssets`? Easiest: call api then if false, compute suggestion via `resolveAssetAlias(alias, api.getLoadedAssets().map(a=>a.alias).concat(api.getAvailableAssets().map(a=>a.alias)))`? But getAvailableAssets currently returns [] (stub). Use assetManifest via dynamic import fallback.

Easier: update handler to call resolver against container labels via `api.getLayerAssets(layer).map(a=>a.alias)` .

Add branches:

```
case "removeAsset": {
  const normLayer = resolveLayer(layer as string);
  if(!normLayer.layer) return fail(`Invalid layer: ${layer}. Valid: background,asset,fixed,status,webcam`);
  // resolve alias suggestion
  const success = api.removeAsset(alias, normLayer.layer as any);
  if(success) return ok(`Removed ${alias}`) else {
    const avail = api.getLayerAssets(normLayer.layer).map(a=>a.alias);
    const r = resolveAssetAlias(alias as string, avail);
    const hint = r.suggestion.length? ` Did you mean ${r.suggestion[0]}?`:"";
    return fail(`Asset not found: ${alias}.${hint}`);
  }
}
```

Similarly `moveAsset`, `placeAsset` (include resolved note), `setFilter` (resolve preset suggestion), `clearFilter`, `setLayerVisibility` (resolve layer), `setBackground` (alias suggestion), `setWebcamPreset`/`setTextIndex`/`setTextPosition` (clamped note).

For `setFilter`: if !presetNorm.preset, fail with suggestion list.

For numeric clamp: capture clamped and if clamped !== original, message: `Webcam preset 99 clamped to 13`

- [ ] **Step 4: Run passes**

Run: `bun test tests/handler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/composition-api/AgentActionHandler.ts
git commit -m "fix: AgentActionHandler layer/filter/alias normalization with suggestions + clamped messages"
```

---

## Task 5: Server Correction Pass + System Prompt Hardening

**Files:**
- Modify: `server/routes/chat.ts:180-210`
- Modify: `server/system-prompt.ts:80-103`
- Create: `server/utils/aliasResolver.ts` (already created in Task1, ensure server import works)
- Modify: `server/filter-presets.ts` (add re-export if needed)

- [ ] **Step 1: Write failing server correction test**

```ts
// tests/serverChat.test.ts
import { resolveAssetAlias } from "../server/utils/aliasResolver";
const assets=["faery/fix/hearts.png","faery/fix/navi.gif"];
const actions=[{type:"removeAsset", alias:"faery/fix/hearts.gif", layer:"fixed"}];
// simulate validActions rewriting
const rewritten = actions.map(a=>({ ...a, alias: resolveAssetAlias(a.alias, assets).alias ?? a.alias }));
expect(rewritten[0].alias).toBe("faery/fix/hearts.png");
```

- [ ] **Step 2: Run fail**

Run: `bun test tests/serverChat.test.ts`
Expected: FAIL before correction pass exists

- [ ] **Step 3: Implement server correction**

In `server/routes/chat.ts` inside `validActions` filter, before validation add normalization block:

```ts
import { resolveAssetAlias, resolveFilterPreset, resolveLayer } from "../utils/aliasResolver";
// assets, backgrounds, filterPresets already loaded
const rewritten = result.parsed.actions.map(a=>{
  let copy={...a};
  if(copy.alias && typeof copy.alias==="string"){
    const pool = copy.type==="setBackground"? backgrounds : assets.map(x=>x.alias);
    const r = resolveAssetAlias(copy.alias as string, pool);
    if(r.alias) copy.alias = r.alias;
  }
  if(copy.layer && typeof copy.layer==="string"){
    const lr = resolveLayer(copy.layer as string);
    if(lr.layer) copy.layer = lr.layer;
  }
  if(copy.preset && typeof copy.preset==="string"){
    const fr = resolveFilterPreset(copy.preset as string, filterPresets);
    if(fr.preset) copy.preset = fr.preset;
  }
  if(copy.intensity!==undefined) copy.intensity = Math.max(0,Math.min(100, Number(copy.intensity)));
  if(copy.index!==undefined) copy.index = Math.floor(Number(copy.index));
  if(copy.x!==undefined) copy.x = Math.max(0,Math.min(1920, Number(copy.x)));
  if(copy.y!==undefined) copy.y = Math.max(0,Math.min(1080, Number(copy.y)));
  if(copy.scale!==undefined) copy.scale = Math.max(0.1,Math.min(2, Number(copy.scale)));
  return copy;
});
```

Replace `validActions = rewritten.filter(`...

Update `server/system-prompt.ts` rule 1 hardened text:

```
1. Copy alias verbatim including extension and case — e.g., faery/fix/hearts.png not hearts.gif or Hearts.PNG. Alias path uses /fix/ for decor but layer param MUST be "fixed" (not "fix"). Never invent alias. If unsure use searchAssets then copy exact alias from results. Filter presets are case-insensitive server-side (grayscale == Grayscale). Layer names are lower-case; fix→fixed handled server-side but send "fixed".
```

Ensure FILTER_PRESET_NAMES already used (it is).

- [ ] **Step 4: Verify**

Run: `bun test tests/serverChat.test.ts` PASS
Run: `bun tsc --noEmit` PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/chat.ts server/system-prompt.ts server/utils/aliasResolver.ts
git commit -m "fix: server alias/filter/layer correction pass + hardened system prompt"
```

---

## Task 6: State Tools Edge Cases + Verification (tsc, lint, build)

**Files:**
- Modify: `src/app/composition-api/CompositionAPI.ts:256-360` (saveState/loadState/deleteState)
- Modify: `src/app/scene-builder/SceneState.ts` (optional dedup)
- Create: `tests/state.test.ts` (optional)

- [ ] **Step 1: Write failing test for duplicate saveState and string numeric index**

```ts
api.saveState("dup"); api.saveState("dup"); expect(loadStates("faery").filter(s=>s.name==="dup").length).toBe(1); // deduplicate
expect(await api.loadState("0")).toBe(false); // string "0" should search name not index
expect(await api.loadState(0)).toBe(true);
```

- [ ] **Step 2: Run fail**

Run: `bun test tests/state.test.ts`
Expected: FAIL — duplicate allowed, string numeric mishandled

- [ ] **Step 3: Fix**

In `CompositionAPI.saveState`: before push, filter existing same name: `const existingIdx = states.findIndex(s=>s.name===name); if(existingIdx!==-1) states.splice(existingIdx,1);`

In `loadState`/`deleteState`: ensure string "0" does not coerce to index: already `typeof nameOrIndex === "number"` only numeric type triggers index path, so string "0" searches name — already correct; keep as-is but add test to guard.

In `deleteState`: same.

In `getState`: ensure return includes visible state without leaking large textures.

Add `getAvailableAssets` to return real manifest assets instead of []: `return getProjectFixAssets(currentProject).concat(getProjectAssets(currentProject).map(p=>p.key)).map(alias=>({alias, type:...}))` but keep simple: optional.

- [ ] **Step 4: Run verification**

Run: `bun test`
Run: `bun tsc --noEmit` Expected PASS
Run: `bun run lint` Expected PASS (or warnings)
Run: `vite build` Expected PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/composition-api/CompositionAPI.ts src/app/scene-builder/SceneState.ts
git commit -m "fix: state deduplication and numeric-index guard"
```

---

## Self-Review
- Spec coverage: all 19 tools have tasks (Task2 assets, Task3 filters/layers/webcam/text, Task4 handler suggests, Task5 server correction+prompt, Task6 state). ✓
- No placeholders: every step has code.
- Type consistency: LayerId, AgentAction types match across tasks.
