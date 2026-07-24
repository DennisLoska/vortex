# Save State Cleanup

## Scope

Two targeted cleanups to the scene builder save state system:

### 1. Unify Asset Entry Types

`FixedAssetEntry` and `DraggedAssetEntry` have identical shape (`alias`, `x`, `y`, `scale`). Replace both with a single `AssetEntry` interface. The serialization arrays stay separate (`fixedAssets`, `draggedAssets`) since restoration logic differs — `FixedAsset.load()` vs raw `Sprite`/`GifSprite` creation — so no behavioral change, just less type noise.

### 2. Filter Layer Audit

The 5 layers (`background`, `asset`, `fixed`, `status`, `webcam`) all save filter state in `LayerStateEntry`. After reviewing actual filter application in the scene builder UI, some layers never use filters. Remove filter controls from layers that don't apply filters, or at minimum filter the UI.

## Non-Goals

- No adding new saved state for background index, webcam preset, status values
- No behavioral changes to save/load logic
- No renaming existing fields in saved JSON (backward compat with existing saved states)

## Files Changed

- `src/app/scene-builder/SceneState.ts` — replace two types with one
- `src/app/scene-builder/SceneBuilder.ts` — update type references
- `src/app/scene-builder/SceneBuilder.ts` (UI section) — filter layer filter controls
