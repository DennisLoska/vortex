# Pixi Best Practices Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply PixiJS v8 best practices to Vortex comp layers for stable realtime VJ performance.

**Architecture:** Keep single CompositionAPI mutation path, add pooling + texture cache + proper destroy/unload + filterArea + culling + transport-ready ticker. No API break.

**Tech Stack:** PixiJS v8, TypeScript, Bun, Vite

---

### Task 1: Engine init prefs + culling + prepare

**Files:**
- Modify: `src/engine/engine.ts:38-56`
- Test: `bun tsc --noEmit`

- [ ] **Step 1: Patch engine init**

```ts
import { Application, Assets, extensions, ResizePlugin, CullerPlugin } from "pixi.js";
import "pixi.js/prepare";

extensions.add(CullerPlugin);
// in init:
opts.resizeTo ??= window;
opts.resolution ??= getResolution();
opts.preference ??= "webgpu";
opts.antialias ??= false;
opts.powerPreference ??= "high-performance";
opts.gcActive ??= true;
opts.gcMaxUnusedTime ??= 60000;
opts.gcFrequency ??= 30000;
await super.init(opts);
this.ticker.maxFPS = 60;
this.ticker.minFPS = 10;
```

- [ ] **Step 2: Run tsc**

Run: `bun tsc --noEmit`
Expected: PASS with no new errors

- [ ] **Step 3: Commit**

```bash
git add src/engine/engine.ts
git commit -m "perf(engine): webgpu pref, GC tuning, culler, ticker caps"
```

### Task 2: AssetSpawner pooling + abort + bounds cache

**Files:**
- Modify: `src/app/screens/main/composition/AssetSpawner.ts`
- Modify: `src/app/screens/main/composition/CompositionAsset.ts`
- Test: `bun tsc --noEmit`

- [ ] **Step 1: Add texture cache + gen guard + view pool**

```ts
private texCache = new Map<string, Texture>();
private viewPool: Container[] = [];
private spawnGen = 0;
async loadCached(key: string): Promise<Texture> {
  let t = this.texCache.get(key);
  if (!t) { t = await Assets.load<Texture>(key); this.texCache.set(key, t); }
  return t;
}
```

Spawn increments gen, checks `if (gen !== this.spawnGen) return` after await. `stop()/clear()/setProject()` bump `spawnGen`, pause videos, recycle views via `releaseView()` instead of destroy.

- [ ] **Step 2: CompositionAsset.dispose preserves texture**

```ts
this.view.removeFromParent();
this.view.destroy({ children: true, texture: false, textureSource: false });
```

Add `reset(view,bounds,profile,x,y,cleanup)` for pool reuse.

- [ ] **Step 3: Replace overlapsAny getBounds loop with cached half-extents**

Store `w/h` at spawn from `texture.width*scale`, compare AABB without `getBounds()`.

- [ ] **Step 4: Run tsc**

Run: `bun tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/main/composition/AssetSpawner.ts src/app/screens/main/composition/CompositionAsset.ts
git commit -m "perf(spawner): texture cache, view pool, abort guard, cached bounds"
```

### Task 3: BackgroundLayer dispose + transition tuning

**Files:**
- Modify: `src/app/screens/main/composition/BackgroundLayer.ts`
- Test: `bun tsc --noEmit`

- [ ] **Step 1: Add dispose + pause offscreen video**

```ts
public dispose() {
  this.loadGen++;
  for (const v of this.videos) { try { v.pause(); } catch {} }
  this.videos = [];
  this.textures = [];
  this.removeChildren();
}
public setTransitionDuration(s: number) { this.transitionDuration = s; }
```

Call `oldVideo.pause()` (not play) on transition out. Default `transitionDuration=1.5`.

- [ ] **Step 2: Run tsc**

Run: `bun tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/BackgroundLayer.ts
git commit -m "perf(background): dispose, pause offscreen video, faster crossfade"
```

### Task 4: CompositionScreen filters + theme throttle + teardown

**Files:**
- Modify: `src/app/screens/main/CompositionScreen.ts`
- Test: `bun tsc --noEmit`

- [ ] **Step 1: Split theme filters, set filterArea, throttle extract**

Two `ColorMatrixFilter` instances (asset, webcam). `updateFilterAreas()` sets `filterArea = new Rectangle(0,0,w,h)` on resize. `extractAndApplyTheme` throttled to 1 per 2s via `lastThemeAt`, wrapped try/catch.

- [ ] **Step 2: Fix teardown**

`hide()` calls `webcam.stop()`, `background.dispose()`. `switchProject` uses `dispose()` not `removeChildren()`. Store keydown handler for `removeEventListener` in `destroy()`.

- [ ] **Step 3: Run tsc**

Run: `bun tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/screens/main/CompositionScreen.ts
git commit -m "fix(composition): per-layer filters, theme throttle, proper teardown"
```

### Task 5: Text/Status/Webcam/Fixed cleanup

**Files:**
- Modify: `src/app/screens/main/composition/TextOverlay.ts`
- Modify: `src/app/screens/main/composition/StatusOverlay.ts`
- Modify: `src/app/screens/main/composition/WebcamAsset.ts`
- Modify: `src/app/screens/main/composition/FixedAssetLayer.ts`
- Modify: `src/app/composition-api/CompositionAPI.ts`
- Test: `bun tsc --noEmit`

- [ ] **Step 1: Text resolution + guarded updates**

Set `text.resolution = 1`, `eventMode static` stays, remove per-frame alloc. StatusOverlay texts `resolution=1`.

- [ ] **Step 2: Webcam stop destroys texture source**

```ts
this.sprite?.destroy({ texture: true, textureSource: true });
this.blobMask?.destroy();
```

- [ ] **Step 3: FixedAssetLayer.clear destroys dragged too, CompositionAPI.loadState destroys**

Replace bare `removeChildren()` with loop destroy `{children:true, texture:false}`.

- [ ] **Step 4: setFilter sets filterArea**

In `setFilter`, after assign `container.filterArea = new Rectangle(0,0,1920,1080)`.

- [ ] **Step 5: Run tsc + lint**

Run: `bun tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/screens/main/composition/TextOverlay.ts src/app/screens/main/composition/StatusOverlay.ts src/app/screens/main/composition/WebcamAsset.ts src/app/screens/main/composition/FixedAssetLayer.ts src/app/composition-api/CompositionAPI.ts
git commit -m "perf(layers): resolution, destroy hygiene, filterArea"
```
