# StatusOverlay — Retro Pixel-Art Video Capture Overlay

## Purpose

A stylistic retro game-inspired overlay for video capture (not a game HUD). Renders hearts healthbar, XP bar, and level display as decorative elements composited over video content. All drawn procedurally via PixiJS Graphics — no external assets needed.

## Architecture

Single Container subclass `StatusOverlay` at `src/app/screens/main/composition/StatusOverlay.ts`.

Follows existing vortex layer pattern: `Container` → `resize(w,h)` → `update(dt)` → wired into `CompositionScreen`.

### Layer Stack Position

```
CompositionScreen (Container)
├── background: BackgroundLayer
├── assetLayer: Container
├── fixedLayer: FixedAssetLayer
├── webcam: WebcamAsset
├── textOverlay: TextOverlay
└── statusOverlay: StatusOverlay    ← NEW: topmost, semitransparent or opaque
```

## Visual Design

### Style Coherence

All three elements share:
- **Pixel-art aesthetic** — hearts drawn at small resolution via CanvasSource then scaled up; XP bar uses blocky/bold rendering; level text uses monospace or pixel-friendly font
- **Retro palette** — vibrant full hearts (red), dim empty hearts (dark gray), green XP bar, white level text
- **Consistent padding** — all positioned at same `padding` distance from screen edge
- **Drop shadow** on all text elements for readability over video

### Hearts Healthbar

- Top-left corner, horizontal row
- Total hearts configurable (`count`), filled hearts configurable (`filled`)
- Empty hearts shown as dim outlines/silhouettes
- Drawn on a small canvas (e.g. 12×11 pixels) pixel-by-pixel for authentic pixel-art look, then rendered as a sprite at target size
- Spacing between hearts configurable

### XP Bar

- Below hearts row, left side, full width configurable
- Dark background bar (rounded rectangle)
- Green fill bar whose width = `(current / max) × totalWidth`
- White text centered in the bar: `"current / max"` (e.g. `"1 / 10"`)
- Value and max separately configurable
- Font matches pixel/retro style

### Level Display

- Top-right corner
- Text label `"LVL {n}"` where n is configurable
- White fill + drop shadow
- Font size configurable

## Config

All settings in a single typed object in `composition.config.ts`:

```typescript
export interface StatusOverlayConfig {
  hearts: {
    count: number;        // total hearts (default 5)
    filled: number;       // how many are filled (default 5)
    size: number;         // rendered pixel size of each heart (default 24)
    spacing: number;      // gap between hearts (default 8)
    fullColor: number;    // color of filled hearts (default 0xff0044)
    emptyColor: number;   // color of empty hearts (default 0x333333)
  };
  experienceBar: {
    current: number;      // current XP value (default 1)
    max: number;          // max XP value (default 10)
    width: number;        // bar total width in pixels (default 200)
    height: number;       // bar height in pixels (default 20)
    color: number;        // fill color (default 0x00ff88)
    backgroundColor: number; // empty bar color (default 0x222222)
    textColor: number;    // centered text color (default 0xffffff)
  };
  level: {
    current: number;      // level number (default 1)
    fontSize: number;     // font size (default 28)
    color: number;        // text color (default 0xffffff)
    label: string;        // label prefix (default "LVL")
  };
  padding: number;        // margin from screen edges (default 20)
}
```

Export a default config object with sensible defaults.

## Drawing the Pixel-Art Heart

Render heart on a 12×11 canvas pixel-by-pixel using CanvasSource:

```
 ██   ██
██████████
██████████
 ████████
  ██████
   ████
    ██
```

Pattern stored as a 2D boolean array or packed integer. Apply fullColor or emptyColor per heart based on whether it's filled.

## Integration

- Add `StatusOverlay` to `CompositionScreen.ts` as last child (topmost visual layer)
- `resize(w,h)` called from `CompositionScreen.resize()` to reposition elements
- `update(dt)` exposes animated transitions if needed later, currently no animation

## Out of Scope

- No animation/transitions in initial version
- No interactivity (pointer events)
- No audio or game logic
