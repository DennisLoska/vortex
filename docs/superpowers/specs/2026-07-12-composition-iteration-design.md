# Realtime Composition Screen — Iteration Design

## Goal
Refine the existing realtime composition screen so that each asset class has a distinct, controlled animation personality, the webcam behaves predictably with manual and automatic presets, text is sourced from files, and the pause control works correctly.

## Current State
- A single `CompositionScreen` with static background, spawned assets, and persistent webcam.
- All spawned assets share the same motion/behaviour pool.
- Text phrases live in `composition.config.ts`.
- `Space` is wired but only toggles the spawner's internal paused flag, so it appears to do nothing.
- Webcam jumps randomly between corners with a tween.

## Requirements

### 1. Background
- Remains completely static.
- No rotation, drift, scale, or fade animation.
- Still resizes to cover the canvas.

### 2. Spawned Asset Animation Profiles
Define three profiles in `composition.config.ts`:

#### Gentle (images + videos + text)
- Rotation range: ±4°
- Translation drift: very slow, e.g. 10–40 px/second
- Scale pulse: subtle, ±5%
- Lifetime on screen: 5–9 seconds
- Fade in/out: 0.5 s each
- Movement should feel like slow floating, not jumping.

#### Lively (GIFs)
- Rotation range: ±12°
- Translation drift: moderate, e.g. 30–80 px/second
- Scale pulse: ±10%
- Lifetime on screen: 3–5 seconds
- Fade in/out: 0.3 s each

#### Text
- Uses the Gentle profile.
- Font: handwritten style (`Caveat` or `Indie Flower`).
- Font size: 32–96 px.

### 3. Webcam
- 10 fixed presets defined as percent-based `{x, y, scale}` values in config.
- Presets cover corners, edges, and center so the feed visits varied screen locations.
- Position changes are instant — no movement tween.
- Press `N` to cycle to the next preset in order.
- Auto-jump: every 30–60 seconds the webcam moves to a random preset that is **not** the current one.
- Webcam texture itself is not animated during jumps.

### 4. Webcam Mask
- A rounded rectangle mask frames the webcam feed.
- Mask has a subtle idle animation: slow scale breath (±3%) and tiny rotation wiggle (±1°).
- The mask animation continues unless the whole composition is paused.

### 5. Text Source
- Phrases move from `composition.config.ts` to `public/texts/*.txt`.
- Each `.txt` file is one phrase.
- Multiline text and empty lines are preserved exactly as written.
- Empty lines should render as blank lines in the displayed text.
- At startup the app fetches all `.txt` files, splits them into phrase blocks, and picks randomly at spawn time.

### 6. Pause / Resume
- Press `Space` to pause/resume the **entire composition**.
- When paused:
  - Stop spawning new assets.
  - Freeze all spawned asset behaviours (drift, rotation, pulse, fade).
  - Freeze the webcam auto-jump timer.
  - Freeze the webcam mask idle animation.
  - Show a pause overlay/popup if the project has one available.
- When resumed: everything continues from where it left off.
- `R` still clears all spawned assets and resumes normal spawning.

### 7. Images vs Videos
- Images and videos share the Gentle profile.
- They can be spawned from separate source pools if the manifest distinguishes them, but the animation feel must be identical.
- GIFs always use the Lively profile.

## Approach
- **Option A**: type-based animation profiles defined in config, applied by `CompositionAsset` based on media type.
- **Text source**: runtime `fetch` of `.txt` files from `public/texts/`.
- **Webcam mask**: Pixi `Graphics` rounded rectangle used as a mask, with its own subtle idle animation.
- **Pause**: screen-level `paused` flag in `CompositionScreen` that gates spawner updates, asset updates, and webcam timer/mask updates.

## Files Affected
- `src/app/screens/main/composition/composition.config.ts`
- `src/app/screens/main/composition/CompositionAsset.ts`
- `src/app/screens/main/composition/AssetSpawner.ts`
- `src/app/screens/main/composition/WebcamAsset.ts`
- `src/app/screens/main/composition/BackgroundLayer.ts`
- `src/app/screens/main/CompositionScreen.ts`
- `src/app/screens/main/composition/behaviors/*`
- `public/style.css` or `index.html` (handwritten font)
- `public/texts/*.txt` (new directory)

## Out of Scope
- Adding new demo assets.
- Changing the background selection logic.
- Audio behaviour changes.
