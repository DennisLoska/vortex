# Composition Screen Iteration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the realtime composition screen with per-asset animation profiles, fixed webcam presets with mask, file-based text phrases, and working pause/resume.

**Architecture:** Introduce type-based animation profiles in config that `CompositionAsset` selects by media type. Move text phrases to `public/texts/*.txt` fetched at runtime. Give `WebcamAsset` 10 percent-based presets, an instant cycle via `N`, an auto-jump timer, and a rounded `Graphics` mask with idle animation. Gate all updates behind a single `paused` flag in `CompositionScreen` so `Space` pauses everything.

**Tech Stack:** PixiJS v8, TypeScript, Vite, CSS web fonts.

---

### Task 1: Add animation profiles to config

**Files:**
- Modify: `src/app/screens/main/composition/composition.config.ts`

- [ ] **Step 1: Replace single motion config with type-based profiles**

Add `AnimationProfile` type and three profiles: `gentle`, `lively`, `none`. Remove the old generic drift/float/orbit weights and replace them with per-type defaults.

```typescript
export type AnimationProfile = "gentle" | "lively" | "none";

export type ProfileConfig = {
  rotationRange: number; // degrees, +/-
  driftSpeed: { min: number; max: number }; // px/second
  scalePulse: { min: number; max: number }; // multiplier around 1
  lifetime: { min: number; max: number }; // seconds
  fadeDuration: number; // seconds
};

export const animationProfiles: Record<AnimationProfile, ProfileConfig> = {
  gentle: {
    rotationRange: 4,
    driftSpeed: { min: 10, max: 40 },
    scalePulse: { min: 0.95, max: 1.05 },
    lifetime: { min: 5, max: 9 },
    fadeDuration: 0.5,
  },
  lively: {
    rotationRange: 12,
    driftSpeed: { min: 30, max: 80 },
    scalePulse: { min: 0.9, max: 1.1 },
    lifetime: { min: 3, max: 5 },
    fadeDuration: 0.3,
  },
  none: {
    rotationRange: 0,
    driftSpeed: { min: 0, max: 0 },
    scalePulse: { min: 1, max: 1 },
    lifetime: { min: 0, max: 0 },
    fadeDuration: 0,
  },
};
```

- [ ] **Step 2: Add webcam preset and timing config**

```typescript
export type WebcamPreset = { x: number; y: number; scale: number };

export const webcamPresets: WebcamPreset[] = [
  { x: 0.05, y: 0.05, scale: 0.2 }, // top-left
  { x: 0.75, y: 0.05, scale: 0.2 }, // top-right
  { x: 0.05, y: 0.75, scale: 0.2 }, // bottom-left
  { x: 0.75, y: 0.75, scale: 0.2 }, // bottom-right
  { x: 0.4, y: 0.05, scale: 0.2 },  // top-center
  { x: 0.4, y: 0.75, scale: 0.2 },  // bottom-center
  { x: 0.05, y: 0.4, scale: 0.2 },  // mid-left
  { x: 0.75, y: 0.4, scale: 0.2 },  // mid-right
  { x: 0.4, y: 0.4, scale: 0.25 },  // center
  { x: 0.75, y: 0.75, scale: 0.15 }, // small corner
];

export const webcamConfig = {
  autoJumpInterval: { min: 30, max: 60 }, // seconds
  mask: {
    cornerRadius: 24,
    width: 320,
    height: 240,
    idleScalePulse: { min: 0.97, max: 1.03 },
    idleRotationRange: 1,
    idleCycle: 4, // seconds
  },
};
```

- [ ] **Step 3: Remove old text array and commit**

Delete `textPhrases` and `textWeight` from config. Keep `spawnInterval`, `maxAssets`, `backgroundAssetName`.

```bash
git add src/app/screens/main/composition/composition.config.ts
git commit -m "config: add animation profiles and webcam presets"
```

---

### Task 2: Make CompositionAsset profile-aware

**Files:**
- Modify: `src/app/screens/main/composition/CompositionAsset.ts`
- Modify: `src/app/screens/main/composition/behaviors/types.ts` (if needed)

- [ ] **Step 1: Update constructor to accept profile and bounds**

```typescript
import { animationProfiles, type AnimationProfile } from "./composition.config";

export class CompositionAsset {
  public view: Container;
  private profile: AnimationProfile;
  private lifetime: number;
  private age = 0;
  private fadeDuration: number;
  private startAlpha = 0;
  private startX: number;
  private startY: number;
  private startScale: number;
  private startRotation: number;
  private driftAngle: number;
  private driftSpeed: number;
  private scalePhase: number;
  private rotationPhase: number;
  private dead = false;

  constructor(
    view: Container,
    bounds: { width: number; height: number },
    profile: AnimationProfile,
  ) {
    this.view = view;
    this.profile = profile;
    const config = animationProfiles[profile];
    this.lifetime = randomFloat(config.lifetime.min, config.lifetime.max);
    this.fadeDuration = config.fadeDuration;

    const pad = 100;
    this.startX = randomFloat(pad, bounds.width - pad);
    this.startY = randomFloat(pad, bounds.height - pad);
    this.startScale = 0.25 + Math.random() * 0.5;
    this.startRotation = (Math.random() - 0.5) * 2 * (config.rotationRange * (Math.PI / 180));
    this.driftAngle = Math.random() * Math.PI * 2;
    this.driftSpeed = randomFloat(config.driftSpeed.min, config.driftSpeed.max);
    this.scalePhase = Math.random() * Math.PI * 2;
    this.rotationPhase = Math.random() * Math.PI * 2;

    view.x = this.startX;
    view.y = this.startY;
    view.scale.set(this.startScale);
    view.rotation = this.startRotation;
    view.alpha = 0;
  }
}
```

- [ ] **Step 2: Rewrite update to use profile config and gentle sine motion**

```typescript
public update(
  ticker: Ticker,
  _bounds: { width: number; height: number },
  globalTime: number,
) {
  if (this.dead) return;

  const dt = ticker.deltaMS / 1000;
  this.age += dt;

  const config = animationProfiles[this.profile];

  if (config.driftSpeed.max > 0) {
    const driftX = Math.cos(this.driftAngle) * this.driftSpeed * this.age;
    const driftY = Math.sin(this.driftAngle) * this.driftSpeed * this.age;
    this.view.x = this.startX + driftX;
    this.view.y = this.startY + driftY;
  }

  if (config.scalePulse.max !== config.scalePulse.min) {
    const pulse = Math.sin(globalTime * 0.8 + this.scalePhase);
    const range = (config.scalePulse.max - config.scalePulse.min) / 2;
    const mid = (config.scalePulse.max + config.scalePulse.min) / 2;
    this.view.scale.set(this.startScale * (mid + pulse * range));
  }

  if (config.rotationRange > 0) {
    const wobble = Math.sin(globalTime * 0.5 + this.rotationPhase);
    const rotationDeg = wobble * config.rotationRange * (Math.PI / 180);
    this.view.rotation = this.startRotation + rotationDeg;
  }

  // fade in
  if (this.age < this.fadeDuration) {
    this.view.alpha = this.age / this.fadeDuration;
  } else if (this.age > this.lifetime - this.fadeDuration) {
    this.view.alpha = (this.lifetime - this.age) / this.fadeDuration;
  } else {
    this.view.alpha = 1;
  }

  if (this.age >= this.lifetime) {
    this.dead = true;
    this.view.alpha = 0;
  }
}
```

- [ ] **Step 3: Add `isDead` getter and `dispose` method**

```typescript
public get isDead() {
  return this.dead;
}

public dispose() {
  this.view.removeFromParent();
  this.view.destroy({ children: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/screens/main/composition/CompositionAsset.ts
git commit -m "feat: profile-aware gentle animation for composition assets"
```

---

### Task 3: Update AssetSpawner to assign profiles and load text files

**Files:**
- Modify: `src/app/screens/main/composition/AssetSpawner.ts`
- Create: `public/texts/*.txt`

- [ ] **Step 1: Add text file discovery**

At class construction, fetch all `.txt` files from `public/texts/`. Vite does not include `public/` files in the manifest, so use a glob import via `import.meta.glob`.

```typescript
const textModules = import.meta.glob("/public/texts/*.txt", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;
```

Load them in `start()`:

```typescript
private phrases: string[] = [];

private async loadPhrases() {
  const entries = Object.entries(textModules);
  if (entries.length === 0) return;
  const loaded = await Promise.all(
    entries.map(async ([, loader]) => {
      const raw = await loader();
      return raw.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
    }),
  );
  this.phrases = loaded.flat();
}
```

- [ ] **Step 2: Assign animation profiles by media type**

In `createView()`, decide profile based on chosen asset:

```typescript
const isGif = lower.endsWith(".gif");
const isVideo = [".mp4", ".webm", ".m4v", ".ogv", ".mov"].some((ext) =>
  lower.endsWith(ext),
);

const profile: AnimationProfile = isGif ? "lively" : "gentle";
```

Pass profile to `CompositionAsset` constructor in `spawn()`:

```typescript
const asset = new CompositionAsset(view, bounds, profile);
```

- [ ] **Step 3: Update text spawn to use gentle profile**

When spawning text, use `"gentle"` profile.

- [ ] **Step 4: Create sample text files**

Create three files in `public/texts/`:

`public/texts/flow.txt`:
```
flow
```

`public/texts/now.txt`:
```
now
```

`public/texts/lines.txt`:
```
line one

line two

line three
```

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/main/composition/AssetSpawner.ts public/texts/
git commit -m "feat: type-based profiles and file-sourced text phrases"
```

---

### Task 4: Add handwritten font

**Files:**
- Modify: `index.html`
- Modify: `public/style.css` (or create if missing)

- [ ] **Step 1: Load Caveat font in index.html**

Add in `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Apply font to Pixi Text**

In `AssetSpawner.ts` text creation:

```typescript
const text = new Text({
  text: phrase,
  style: {
    fontFamily: "Caveat, cursive",
    fontSize: 32 + Math.random() * 64,
    fill: 0xffffff,
    dropShadow: {
      distance: 2,
      blur: 2,
      color: "#000000",
      alpha: 0.5,
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add index.html src/app/screens/main/composition/AssetSpawner.ts
git commit -m "feat: use handwritten Caveat font for text assets"
```

---

### Task 5: Refactor WebcamAsset for presets, instant jumps, and mask

**Files:**
- Modify: `src/app/screens/main/composition/WebcamAsset.ts`

- [ ] **Step 1: Replace random corner logic with presets**

Store current preset index. Add `nextPreset()` and `jumpToRandomPreset()`.

```typescript
import { webcamPresets, webcamConfig } from "./composition.config";

export class WebcamAsset extends Container {
  private videoSprite: Sprite | undefined;
  private maskGraphics: Graphics;
  private currentPresetIndex = 0;
  private bounds = { width: 1920, height: 1080 };
  private autoJumpTimer = 0;
  private nextAutoJump = randomFloat(
    webcamConfig.autoJumpInterval.min,
    webcamConfig.autoJumpInterval.max,
  );
  private idleTime = 0;

  constructor() {
    super();
    this.maskGraphics = new Graphics();
    this.addChild(this.maskGraphics);
    this.applyPreset(0);
  }
}
```

- [ ] **Step 2: Apply preset instantly**

```typescript
private applyPreset(index: number) {
  this.currentPresetIndex = index;
  const preset = webcamPresets[index];
  const w = webcamConfig.mask.width * preset.scale;
  const h = webcamConfig.mask.height * preset.scale;
  this.x = this.bounds.width * preset.x;
  this.y = this.bounds.height * preset.y;

  if (this.videoSprite) {
    this.videoSprite.width = w;
    this.videoSprite.height = h;
  }
  this.drawMask(w, h);
}
```

- [ ] **Step 3: Draw rounded mask**

```typescript
private drawMask(width: number, height: number) {
  this.maskGraphics.clear();
  this.maskGraphics.roundRect(
    -width / 2,
    -height / 2,
    width,
    height,
    webcamConfig.mask.cornerRadius,
  );
  this.maskGraphics.fill(0xffffff);
  if (this.videoSprite) {
    this.videoSprite.mask = this.maskGraphics;
  }
}
```

- [ ] **Step 4: Public controls**

```typescript
public nextPreset() {
  const next = (this.currentPresetIndex + 1) % webcamPresets.length;
  this.applyPreset(next);
}

public jumpToRandomPreset() {
  let next = this.currentPresetIndex;
  while (next === this.currentPresetIndex) {
    next = Math.floor(Math.random() * webcamPresets.length);
  }
  this.applyPreset(next);
}
```

- [ ] **Step 5: Update init to use mask**

```typescript
public async init() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.play();
  await waitForVideoReady(video);

  const texture = Texture.from(video);
  this.videoSprite = new Sprite({ texture, anchor: 0.5 });
  this.addChild(this.videoSprite);
  this.videoSprite.mask = this.maskGraphics;
  this.applyPreset(this.currentPresetIndex);
}
```

- [ ] **Step 6: Add subtle mask idle animation and auto-jump**

```typescript
public update(ticker: Ticker) {
  const dt = ticker.deltaMS / 1000;
  this.idleTime += dt;

  const { idleScalePulse, idleRotationRange, idleCycle } = webcamConfig.mask;
  const cycle = Math.sin((this.idleTime / idleCycle) * Math.PI * 2);
  const scaleRange = (idleScalePulse.max - idleScalePulse.min) / 2;
  const scaleMid = (idleScalePulse.max + idleScalePulse.min) / 2;
  this.maskGraphics.scale.set(scaleMid + cycle * scaleRange);
  this.maskGraphics.rotation = cycle * idleRotationRange * (Math.PI / 180);

  this.autoJumpTimer += dt;
  if (this.autoJumpTimer >= this.nextAutoJump) {
    this.jumpToRandomPreset();
    this.autoJumpTimer = 0;
    this.nextAutoJump = randomFloat(
      webcamConfig.autoJumpInterval.min,
      webcamConfig.autoJumpInterval.max,
    );
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app/screens/main/composition/WebcamAsset.ts
git commit -m "feat: webcam presets, instant jumps, rounded mask"
```

---

### Task 6: Wire pause/resume through CompositionScreen

**Files:**
- Modify: `src/app/screens/main/CompositionScreen.ts`

- [ ] **Step 1: Add paused flag and global time**

```typescript
export class CompositionScreen extends Container {
  private paused = false;
  private globalTime = 0;
  // ... existing fields
}
```

- [ ] **Step 2: Gate update loop**

```typescript
public update(ticker: Ticker) {
  if (this.paused) return;
  const dt = ticker.deltaMS / 1000;
  this.globalTime += dt;
  this.spawner.update(ticker, this.bounds, this.globalTime);
  this.webcam.update(ticker);
}
```

- [ ] **Step 3: Implement pause/resume/reset**

```typescript
public pause() {
  this.paused = true;
  this.spawner.pause();
}

public resume() {
  this.paused = false;
  this.spawner.resume();
}

public togglePause() {
  if (this.paused) {
    this.resume();
  } else {
    this.pause();
  }
}

public reset() {
  this.spawner.clear();
}
```

- [ ] **Step 4: Update keyboard handlers**

```typescript
private setupKeyboard() {
  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      this.togglePause();
    }
    if (event.code === "KeyR") {
      this.reset();
    }
    if (event.code === "KeyN") {
      this.webcam.nextPreset();
    }
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/main/CompositionScreen.ts
git commit -m "feat: global pause/resume and N key for webcam preset"
```

---

### Task 7: Update spawner update signature

**Files:**
- Modify: `src/app/screens/main/composition/AssetSpawner.ts`

- [ ] **Step 1: Pass global time through**

```typescript
public update(
  ticker: Ticker,
  bounds: { width: number; height: number },
  globalTime: number,
) {
  for (let i = this.assets.length - 1; i >= 0; i--) {
    const asset = this.assets[i];
    asset.update(ticker, bounds, globalTime);
    if (asset.isDead) {
      this.container.removeChild(asset.view);
      this.assets.splice(i, 1);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/screens/main/composition/AssetSpawner.ts
git commit -m "refactor: pass global time to spawned assets"
```

---

### Task 8: Freeze background layer completely

**Files:**
- Modify: `src/app/screens/main/composition/BackgroundLayer.ts`

- [ ] **Step 1: Verify no animation exists**

The file should only set the sprite texture and resize it. Remove any tick/update methods if present. Ensure the sprite anchor is center and it is scaled to cover.

- [ ] **Step 2: Commit (if any change)**

```bash
git add src/app/screens/main/composition/BackgroundLayer.ts
git commit -m "fix: keep background layer completely static"
```

---

### Task 9: Verify build, lint, and manual checks

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Manual browser verification**

Run `npm run dev`, open `http://localhost:8080/`, and confirm:
- Background is static.
- Images/videos move slowly and gently.
- GIFs move faster.
- Text uses Caveat font and preserves multiline/empty lines.
- `Space` pauses all motion and spawning.
- `R` clears assets.
- `N` cycles webcam preset instantly.
- Webcam auto-jumps every 30–60 s.
- Webcam has rounded mask with subtle breathing animation.

- [ ] **Step 4: Commit any fixes**

---

## Self-Review

- **Spec coverage:** Every requirement maps to a task.
  - Static background → Task 8
  - Gentle images/videos → Tasks 1, 2, 3
  - Lively GIFs → Tasks 1, 2, 3
  - Webcam presets/N/auto-jump → Task 5
  - Webcam mask → Task 5
  - Handwritten font → Task 4
  - Text files → Tasks 3, 4
  - Pause fix → Task 6
- **Placeholder scan:** No TBD/TODO. All code shown.
- **Type consistency:** `AnimationProfile`, `ProfileConfig`, `WebcamPreset` used consistently.
