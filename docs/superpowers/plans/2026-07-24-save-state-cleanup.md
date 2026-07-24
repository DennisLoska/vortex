# Save State Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up save state types and audit layer filter integration.

**Architecture:** Two independent tasks: (1) replace duplicate `FixedAssetEntry`/`DraggedAssetEntry` with single `AssetEntry` type, update all references; (2) audit filter layer state — all 5 layers extend Container and support `.filters`, so the existing uniform filter UI is correct; no change needed.

**Tech Stack:** TypeScript, PixiJS v8

---

### Task 1: Unify Asset Entry Types

**Files:**
- Modify: `src/app/scene-builder/SceneState.ts:1-13`
- Modify: `src/app/scene-builder/SceneBuilder.ts:660-671`

- [ ] **Step 1: Replace duplicate interfaces with single `AssetEntry`**

In `src/app/scene-builder/SceneState.ts`, replace `FixedAssetEntry` and `DraggedAssetEntry` with a single `AssetEntry`:

```typescript
export interface AssetEntry {
  alias: string;
  x: number;
  y: number;
  scale: number;
}
```

Update `SceneState` to use `AssetEntry` for both arrays:

```typescript
export interface SceneState {
  name: string;
  timestamp: number;
  fixedAssets: AssetEntry[];
  draggedAssets: AssetEntry[];
  layers: Record<string, LayerStateEntry>;
  textOverlay: TextOverlayEntry | null;
}
```

- [ ] **Step 2: Update serialization type annotations**

In `src/app/scene-builder/SceneBuilder.ts`, replace the two inline typed arrays in `serializeCurrentState()` (lines ~660-671):

```typescript
// Before:
const fixedAssets: {
  alias: string;
  x: number;
  y: number;
  scale: number;
}[] = [];
const draggedAssets: {
  alias: string;
  x: number;
  y: number;
  scale: number;
}[] = [];

// After:
const fixedAssets: AssetEntry[] = [];
const draggedAssets: AssetEntry[] = [];
```

Add import at top:
```typescript
import { loadStates, saveStates, type AssetEntry, type SceneState } from "./SceneState";
```

- [ ] **Step 3: Verify**

```bash
npm run lint 2>&1 && npx tsc --noEmit 2>&1
echo "ALL CLEAN"
```

- [ ] **Step 4: Commit**

```bash
git add src/app/scene-builder/
git commit -m "refactor: unify FixedAssetEntry and DraggedAssetEntry into AssetEntry"
```

---

### Task 2: Audit Filter Layer State

**Files:**
- Examine: `src/app/scene-builder/SceneBuilder.ts:306-382`
- Examine: `src/app/scene-builder/SceneBuilder.ts:257-282`

- [ ] **Step 1: Check all layers for filter support**

All 5 layers extend `Container`:
- `BackgroundLayer extends Container` — supports `.filters`
- `assetLayer` is a plain `Container` — supports `.filters`
- `FixedAssetLayer extends Container` — supports `.filters`
- `StatusOverlay extends Container` — supports `.filters`
- `WebcamAsset extends Container` — supports `.filters`

All layers use the same `layerContentHTML()` template (line 306) which includes the filter section (lines 359-366). The `applyFilter()` method (line 257) uses `getLayerContainer()` → sets `.filters` on the container. This works uniformly for all 5 layers.

`getAvailableAssets()` returns `[]` for `status` and `webcam` (lines 402-404), but the filter section is independent of available assets — filters are about the container's rendered content, not asset selection.

**Conclusion:** All 5 layers consistently support and render filter controls. No change needed.

- [ ] **Step 2: Verify**

```bash
npm run lint 2>&1 && npx tsc --noEmit 2>&1
echo "ALL CLEAN"
```

- [ ] **Step 3: Commit (mark as reviewed)**

```bash
git commit --allow-empty -m "docs: filter layer audit — all 5 layers support filters, no change needed"
```
