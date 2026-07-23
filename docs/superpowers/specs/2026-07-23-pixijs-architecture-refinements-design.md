# PixiJS Architecture Refinements Design

**Goal:** Fix 3 PixiJS v8 anti-patterns in Vortex

**Architecture:** Three independent refactors — manifest service module, BackgroundLayer migration to PixiJS Assets pipeline, CreationResizePlugin delegation to stock ResizePlugin

---

## Refactor 1: Single Manifest Service

**Problem:** 4 files import `manifest.json` with `@ts-ignore` and crawl the raw JSON independently. Shape changes require updating all 4 consumers.

**Solution:** `src/app/assetManifest.ts` — singleton that imports JSON once, provides typed accessors.

**Interface:**
```ts
getProjectNames(): string[]
getProjectAssets(project): PoolEntry[]  // filtered + categorized
getProjectBackgrounds(project): { videoAliases: string[], imageAliases: string[] }
```

**Files:**
- Create: `src/app/assetManifest.ts`
- Create: `src/manifest.d.ts` (types for manifest shape)
- Modify: `src/app/screens/main/CompositionScreen.ts` — replace inline `getProjectNames()`
- Modify: `src/app/screens/main/composition/AssetSpawner.ts` — replace `buildPool()`
- Modify: `src/app/screens/main/composition/BackgroundLayer.ts` — replace manifest crawling
- Modify: `src/engine/engine.ts` — keep direct manifest import for `Assets.init`

---

## Refactor 2: BackgroundLayer via PixiJS Assets

**Problem:** BackgroundLayer creates raw `<video>`/`<img>` DOM elements with manual concurrency pools, duplicating PixiJS asset loading.

**Solution:** Register background assets as PixiJS bundle, load via `Assets.loadBundle()`.

**Files:**
- Modify: `src/app/screens/main/composition/BackgroundLayer.ts` — use `Assets.add` + `Assets.loadBundle` instead of raw DOM loading
- Remove `loadAllInBackground`, `batchLoad`, manual `HTMLVideoElement[]` tracking
- Keep crossfade, zoom, auto-advance, playback control logic

---

## Refactor 3: CreationResizePlugin Delegates to Stock ResizePlugin

**Problem:** ~80 lines of boilerplate (resizeTo setter, queueResize, cancelResize, event listeners) duplicated from PixiJS built-in `ResizePlugin`.

**Solution:** Call `ResizePlugin.init.call(this, options)` then override just `this.resize` with custom math. Remove `extensions.remove(ResizePlugin)` — CreationResizePlugin's init subsumes it.

**Files:**
- Modify: `src/engine/resize/ResizePlugin.ts` — delegate boilerplate to stock, keep only custom resize
- Modify: `src/engine/engine.ts` — still `extensions.remove(ResizePlugin)` + `add(CreationResizePlugin)`
