# Real-Time Programmable Video Composition

## Goal
Build a browser-based real-time video composition screen. A static background fills the canvas while random assets (text, images, GIFs, video clips) spawn, animate, and move across the screen. A webcam feed is a persistent asset that occasionally jumps position but mostly stays still. The composition is designed to be screen-recorded with OBS.

## Decisions from Brainstorming
- Replace the existing `MainScreen` (template content) with the composition screen.
- Auto-discover spawnable assets from the AssetPack-generated manifest.
- Full-window canvas with minimal keyboard controls: `Space` to pause/resume spawning, `R` to reset.

## Scope
### In Scope
- Static full-screen background (image or video).
- Auto-discovery of spawnable media from `raw-assets/` via the AssetPack manifest.
- Random spawner for images, GIFs, videos, and generated text.
- Motion behaviors: float, drift, orbit, pulse.
- Persistent webcam layer with occasional jumps.
- Keyboard controls.

### Out of Scope
- Timeline/scene editor.
- Interactive drag-and-drop asset editor.
- OBS integration (user handles recording externally).
- Audio reactive visuals.
- Persistence of compositions.

## Architecture

### File Structure
```
src/app/screens/main/
├── CompositionScreen.ts          # replaces MainScreen
└── composition/
    ├── composition.config.ts     # tunable parameters
    ├── BackgroundLayer.ts        # static background
    ├── AssetSpawner.ts           # random spawn controller
    ├── CompositionAsset.ts       # wrapper for one spawned item
    ├── WebcamAsset.ts            # persistent webcam sprite
    └── behaviors/
        ├── float.ts
        ├── drift.ts
        ├── orbit.ts
        └── pulse.ts
```

### Components

#### CompositionScreen
- Entry point for the composition.
- Owns `BackgroundLayer`, `AssetSpawner`, and `WebcamAsset`.
- Handles keyboard input: `Space` pauses/resumes spawning, `R` clears all spawned assets and restarts.
- Exposes `resize(width, height)` to update background and bounds.
- Lifecycle: `prepare()`, `update(ticker)`, `pause()`, `resume()`, `reset()`, `show()`, `hide()`.

#### BackgroundLayer
- Loads the first image or video found in the manifest as the background.
- Optional: look for a file named `background.*` first; fall back to the first image/video in any bundle.
- Scales to cover the full canvas while preserving aspect ratio (object-fit cover behavior).
- Remains static for the entire session.

#### AssetSpawner
- Reads the AssetPack manifest and builds a pool of spawnable assets.
- Filters by extension: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`, `.gif`, `.mp4`, `.webm`, `.m4v`, `.ogv`, `.mov`.
- Excludes assets used for the background and the preload logo.
- Spawns a new `CompositionAsset` at a configured interval.
- Respects a maximum on-screen asset count; removes oldest when exceeded.
- Randomly assigns a motion behavior and a lifetime.
- Can be paused/resumed.

#### CompositionAsset
- Wraps one spawned item.
- Supports media types:
  - Image: `Sprite` from texture.
  - GIF: `GifSprite` with auto-play.
  - Video clip: `Sprite` with `VideoSource`.
  - Text: `Text` with random phrase and style.
- Handles fade in/out, lifetime, and bounds.
- Delegates movement to a behavior.

#### Motion Behaviors
Each behavior receives the asset, canvas bounds, and ticker delta.

- **Float:** gentle up/down + left/right sine motion.
- **Drift:** constant velocity with optional rotation.
- **Orbit:** move in a circle around a center point.
- **Pulse:** scale in place with opacity pulsing.

#### WebcamAsset
- Requests `navigator.mediaDevices.getUserMedia({ video: true })`.
- Creates a hidden `<video>` element and a PixiJS `Sprite` using the stream as a texture.
- Default position: bottom-right corner, scaled to ~20% of screen width.
- On a low-frequency timer (e.g., every 10–20 seconds), animates to a new corner/edge.
- Stays visible and live between jumps.
- Handles permission denial gracefully (shows placeholder or hides).

### Data Flow
1. `CreationEngine` loads the AssetPack manifest and bundles.
2. `CompositionScreen` is created and shown.
3. `BackgroundLayer` picks and displays the background.
4. `AssetSpawner` scans the manifest and begins spawning at intervals.
5. Each spawned asset picks a behavior and updates every frame.
6. `WebcamAsset` initializes the camera and begins its jump timer.
7. Keyboard events pause/resume spawning or reset the composition.

## Configuration
`composition.config.ts` exposes:

```ts
export const compositionConfig = {
  spawnInterval: { min: 0.5, max: 1.5 }, // seconds
  maxAssets: 12,
  assetLifetime: { min: 6, max: 14 }, // seconds
  textPhrases: ["hello", "vortex", "flow", "glitch", "dream"],
  textWeight: 0.2, // 20% of spawns are text
  behaviorWeights: {
    float: 0.25,
    drift: 0.35,
    orbit: 0.25,
    pulse: 0.15,
  },
  webcam: {
    scale: 0.2, // fraction of screen width
    jumpInterval: { min: 10, max: 20 }, // seconds
    corners: ["top-left", "top-right", "bottom-left", "bottom-right"],
  },
};
```

## Error Handling
- If no spawnable assets are found, show a warning in the console and spawn only text.
- If webcam permission is denied, log a warning and do not create the webcam layer.
- Video/GIF load failures are caught and the asset is destroyed.
- Background fallback: solid color from engine options if no background asset is found.

## Keyboard Controls
- `Space` — pause/resume asset spawning.
- `R` — clear all spawned assets and restart spawning.

## Testing Plan
- Manual verification:
  - Background covers the canvas.
  - Assets spawn at intervals and move correctly.
  - Webcam initializes and jumps on timer.
  - `Space` and `R` work.
  - `npm run build` passes.
  - `npm run lint` passes.

## Open Questions / Future Work
- Add audio reactive motion.
- Add more text styling and font choices.
- Allow users to mark assets as background-only via filename convention.
