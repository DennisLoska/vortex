# Real-Time Video Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template `MainScreen` with a `CompositionScreen` that shows a static background, randomly spawns animated image/GIF/video/text assets, and displays a persistent webcam feed that occasionally jumps position.

**Architecture:** One screen owns a background layer, an asset spawner, and a webcam layer. The spawner auto-discovers media from the AssetPack manifest and wraps each item in a `CompositionAsset` with a randomly assigned motion behavior. All configuration lives in a single config file.

**Tech Stack:** TypeScript, PixiJS v8, `@pixi/sound`, `@pixi/ui`, `motion`, Vite, CreationEngine.

---

## File Structure

- **Create:**
  - `src/app/screens/main/CompositionScreen.ts` — main screen
  - `src/app/screens/main/composition/composition.config.ts` — tunable config
  - `src/app/screens/main/composition/BackgroundLayer.ts` — static background
  - `src/app/screens/main/composition/AssetSpawner.ts` — spawn controller
  - `src/app/screens/main/composition/CompositionAsset.ts` — spawned item wrapper
  - `src/app/screens/main/composition/WebcamAsset.ts` — persistent webcam sprite
  - `src/app/screens/main/composition/behaviors/float.ts`
  - `src/app/screens/main/composition/behaviors/drift.ts`
  - `src/app/screens/main/composition/behaviors/orbit.ts`
  - `src/app/screens/main/composition/behaviors/pulse.ts`
- **Modify:**
  - `src/main.ts` — import and show `CompositionScreen` instead of `MainScreen`
- **Delete:**
  - `src/app/screens/main/MainScreen.ts`
  - `src/app/screens/main/Bouncer.ts`
  - `src/app/screens/main/Logo.ts`

---

## Task 1: Add composition configuration

**Files:**
- Create: `src/app/screens/main/composition/composition.config.ts`

- [ ] **Step 1: Create the config file**

```ts
export const compositionConfig = {
  spawnInterval: { min: 0.5, max: 1.5 },
  maxAssets: 12,
  assetLifetime: { min: 6, max: 14 },
  textPhrases: ["hello", "vortex", "flow", "glitch", "dream", "now"],
  textWeight: 0.2,
  behaviorWeights: {
    float: 0.25,
    drift: 0.35,
    orbit: 0.25,
    pulse: 0.15,
  },
  backgroundAssetName: "background",
  webcam: {
    scale: 0.2,
    jumpInterval: { min: 10, max: 20 },
    margin: 24,
    corners: ["top-left", "top-right", "bottom-left", "bottom-right"] as const,
  },
};

export type CompositionConfig = typeof compositionConfig;
export type WebcamCorner = (typeof compositionConfig.webcam.corners)[number];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/composition.config.ts
git commit -m "feat: add composition config"
```

---

## Task 2: Build the static background layer

**Files:**
- Create: `src/app/screens/main/composition/BackgroundLayer.ts`

- [ ] **Step 1: Create BackgroundLayer**

```ts
import { Container, Sprite, Texture, VideoSource } from "pixi.js";

export class BackgroundLayer extends Container {
  private sprite: Sprite | undefined;

  public async setBackground(texture: Texture) {
    if (this.sprite) {
      this.removeChild(this.sprite);
      this.sprite.destroy();
      this.sprite = undefined;
    }

    this.sprite = new Sprite({ texture, anchor: 0.5 });
    this.addChild(this.sprite);
    this.resize(this.parent?.width ?? 1920, this.parent?.height ?? 1080);
  }

  public resize(width: number, height: number) {
    if (!this.sprite) return;

    const texture = this.sprite.texture;
    const isVideo = texture.source instanceof VideoSource;
    if (isVideo) {
      const video = (texture.source as VideoSource).resource;
      video?.play?.();
    }

    const scale = Math.max(width / texture.width, height / texture.height);
    this.sprite.scale.set(scale);
    this.sprite.position.set(width * 0.5, height * 0.5);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/BackgroundLayer.ts
git commit -m "feat: add background layer"
```

---

## Task 3: Build motion behaviors

**Files:**
- Create: `src/app/screens/main/composition/behaviors/float.ts`
- Create: `src/app/screens/main/composition/behaviors/drift.ts`
- Create: `src/app/screens/main/composition/behaviors/orbit.ts`
- Create: `src/app/screens/main/composition/behaviors/pulse.ts`
- Create: `src/app/screens/main/composition/behaviors/types.ts`

- [ ] **Step 1: Create shared behavior types**

```ts
import type { Container, Ticker } from "pixi.js";

export interface BehaviorContext {
  asset: Container;
  bounds: { width: number; height: number };
  ticker: Ticker;
}

export interface Behavior {
  update(ctx: BehaviorContext): void;
  dispose?(): void;
}
```

- [ ] **Step 2: Create float behavior**

```ts
import type { Behavior, BehaviorContext } from "./types";

export class FloatBehavior implements Behavior {
  private time = 0;
  private speedX: number;
  private speedY: number;
  private amplitudeX: number;
  private amplitudeY: number;

  constructor() {
    this.speedX = 0.5 + Math.random() * 1.5;
    this.speedY = 0.5 + Math.random() * 1.5;
    this.amplitudeX = 20 + Math.random() * 40;
    this.amplitudeY = 20 + Math.random() * 40;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.time += ticker.deltaMS * 0.001;
    asset.x += Math.sin(this.time * this.speedX) * this.amplitudeX * 0.01;
    asset.y += Math.cos(this.time * this.speedY) * this.amplitudeY * 0.01;
  }
}
```

- [ ] **Step 3: Create drift behavior**

```ts
import type { Behavior, BehaviorContext } from "./types";

export class DriftBehavior implements Behavior {
  private vx: number;
  private vy: number;
  private rotationSpeed: number;

  constructor() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
  }

  update({ asset }: BehaviorContext) {
    asset.x += this.vx;
    asset.y += this.vy;
    asset.rotation += this.rotationSpeed;
  }
}
```

- [ ] **Step 4: Create orbit behavior**

```ts
import type { Behavior, BehaviorContext } from "./types";

export class OrbitBehavior implements Behavior {
  private centerX: number;
  private centerY: number;
  private radius: number;
  private speed: number;
  private angle: number;

  constructor(bounds: { width: number; height: number }) {
    this.centerX = bounds.width * 0.5;
    this.centerY = bounds.height * 0.5;
    this.radius = 100 + Math.random() * 300;
    this.speed = 0.2 + Math.random() * 0.8;
    this.angle = Math.random() * Math.PI * 2;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.angle += ticker.deltaMS * 0.001 * this.speed;
    asset.x = this.centerX + Math.cos(this.angle) * this.radius;
    asset.y = this.centerY + Math.sin(this.angle) * this.radius;
  }
}
```

- [ ] **Step 5: Create pulse behavior**

```ts
import type { Behavior, BehaviorContext } from "./types";

export class PulseBehavior implements Behavior {
  private time = 0;
  private speed: number;
  private baseScale: number;

  constructor() {
    this.speed = 1 + Math.random() * 2;
    this.baseScale = 0.5 + Math.random() * 0.5;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.time += ticker.deltaMS * 0.001;
    const scale = this.baseScale + Math.sin(this.time * this.speed) * 0.15;
    asset.scale.set(scale);
    asset.alpha = 0.6 + Math.abs(Math.sin(this.time * this.speed)) * 0.4;
  }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/screens/main/composition/behaviors/
git commit -m "feat: add motion behaviors"
```

---

## Task 4: Build the spawned asset wrapper

**Files:**
- Create: `src/app/screens/main/composition/CompositionAsset.ts`

- [ ] **Step 1: Create CompositionAsset**

```ts
import { animate } from "motion";
import type { Container, Ticker } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { compositionConfig } from "./composition.config";
import { DriftBehavior } from "./behaviors/drift";
import { FloatBehavior } from "./behaviors/float";
import { OrbitBehavior } from "./behaviors/orbit";
import { PulseBehavior } from "./behaviors/pulse";
import type { Behavior } from "./behaviors/types";

const behaviors = {
  float: FloatBehavior,
  drift: DriftBehavior,
  orbit: OrbitBehavior,
  pulse: PulseBehavior,
};

export class CompositionAsset {
  public view: Container;
  private behavior: Behavior;
  private lifetime: number;
  private age = 0;
  private disposed = false;

  constructor(view: Container, bounds: { width: number; height: number }) {
    this.view = view;
    this.view.position.set(randomFloat(0, bounds.width), randomFloat(0, bounds.height));
    this.view.alpha = 0;
    this.lifetime = randomFloat(
      compositionConfig.assetLifetime.min,
      compositionConfig.assetLifetime.max,
    ) * 1000;

    const behaviorKey = this.pickBehavior();
    const BehaviorClass = behaviors[behaviorKey];
    this.behavior = behaviorKey === "orbit" ? new BehaviorClass(bounds) : new BehaviorClass();

    animate(this.view, { alpha: 1 }, { duration: 0.4 });
  }

  public update(ticker: Ticker, bounds: { width: number; height: number }) {
    if (this.disposed) return;
    this.age += ticker.deltaMS;
    this.behavior.update({ asset: this.view, bounds, ticker });

    if (this.age >= this.lifetime - 1000 && this.view.alpha > 0) {
      animate(this.view, { alpha: 0 }, { duration: 0.5 });
    }

    if (this.age >= this.lifetime) {
      this.dispose();
    }
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.behavior.dispose?.();
    this.view.destroy({ children: true });
  }

  public get isDead() {
    return this.disposed;
  }

  private pickBehavior(): keyof typeof behaviors {
    const weights = compositionConfig.behaviorWeights;
    const total = weights.float + weights.drift + weights.orbit + weights.pulse;
    const roll = Math.random() * total;
    let cumulative = 0;

    cumulative += weights.float;
    if (roll < cumulative) return "float";
    cumulative += weights.drift;
    if (roll < cumulative) return "drift";
    cumulative += weights.orbit;
    if (roll < cumulative) return "orbit";
    return "pulse";
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/CompositionAsset.ts
git commit -m "feat: add composition asset wrapper"
```

---

## Task 5: Build the asset spawner

**Files:**
- Create: `src/app/screens/main/composition/AssetSpawner.ts`

- [ ] **Step 1: Create AssetSpawner**

```ts
import { Assets, Container, Sprite, Text, Texture, VideoSource } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Ticker } from "pixi.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../manifest.json";

import { randomFloat, randomItem } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { CompositionAsset } from "./CompositionAsset";
import { compositionConfig } from "./composition.config";

const SPAWNABLE_EXTENSIONS = [
  ".png", ".jpg", ".jpeg", ".webp", ".svg",
  ".gif", ".mp4", ".webm", ".m4v", ".ogv", ".mov",
];

export class AssetSpawner {
  private container: Container;
  private assets: CompositionAsset[] = [];
  private pool: string[] = [];
  private paused = false;
  private running = false;

  constructor(container: Container) {
    this.container = container;
    this.buildPool();
  }

  public get isPaused() {
    return this.paused;
  }

  public async start(bounds: { width: number; height: number }) {
    this.running = true;
    while (this.running) {
      if (!this.paused) {
        await this.spawn(bounds);
      }
      const interval = randomFloat(
        compositionConfig.spawnInterval.min,
        compositionConfig.spawnInterval.max,
      );
      await waitFor(interval);
    }
  }

  public stop() {
    this.running = false;
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
  }

  public clear() {
    for (const asset of this.assets) {
      asset.dispose();
    }
    this.assets = [];
  }

  public update(ticker: Ticker, bounds: { width: number; height: number }) {
    for (let i = this.assets.length - 1; i >= 0; i--) {
      const asset = this.assets[i];
      asset.update(ticker, bounds);
      if (asset.isDead) {
        this.container.removeChild(asset.view);
        this.assets.splice(i, 1);
      }
    }
  }

  private buildPool() {
    const seen = new Set<string>();

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
        const firstSrc = srcs[0];
        const lower = firstSrc.toLowerCase();

        if (SPAWNABLE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
          const aliases = Array.isArray(asset.alias) ? asset.alias : [asset.alias];
          const key = aliases[0] ?? firstSrc;
          if (!seen.has(key)) {
            seen.add(key);
            this.pool.push(key);
          }
        }
      }
    }
  }

  private async spawn(bounds: { width: number; height: number }) {
    if (this.assets.length >= compositionConfig.maxAssets) {
      const oldest = this.assets.shift();
      if (oldest) {
        oldest.dispose();
        this.container.removeChild(oldest.view);
      }
    }

    const view = await this.createView();
    if (!view) return;

    const asset = new CompositionAsset(view, bounds);
    this.assets.push(asset);
    this.container.addChild(view);
  }

  private async createView(): Promise<Container | undefined> {
    const isText = Math.random() < compositionConfig.textWeight || this.pool.length === 0;

    if (isText) {
      const text = new Text({
        text: randomItem(compositionConfig.textPhrases),
        style: {
          fontFamily: "Arial",
          fontSize: 32 + Math.random() * 64,
          fill: 0xffffff,
          dropShadow: true,
          dropShadowDistance: 2,
        },
      });
      text.anchor.set(0.5);
      return text;
    }

    const key = randomItem(this.pool);
    const lower = key.toLowerCase();

    if (lower.endsWith(".gif")) {
      const source = await Assets.load(key);
      const gif = new GifSprite({ source, autoPlay: true });
      gif.anchor.set(0.5);
      gif.scale.set(0.25 + Math.random() * 0.5);
      return gif;
    }

    if ([".mp4", ".webm", ".m4v", ".ogv", ".mov"].some((ext) => lower.endsWith(ext))) {
      const texture = await Assets.load<Texture>(key);
      const source = texture.source as VideoSource;
      const videoElement = source.resource;
      videoElement.loop = true;
      videoElement?.play?.();
      const video = new Sprite({ texture, anchor: 0.5 });
      video.scale.set(0.25 + Math.random() * 0.5);
      return video;
    }

    const texture = await Assets.load<Texture>(key);
    const sprite = new Sprite({ texture, anchor: 0.5 });
    sprite.scale.set(0.25 + Math.random() * 0.5);
    return sprite;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/AssetSpawner.ts
git commit -m "feat: add asset spawner"
```

---

## Task 6: Build the webcam asset

**Files:**
- Create: `src/app/screens/main/composition/WebcamAsset.ts`

- [ ] **Step 1: Create WebcamAsset**

```ts
import { animate } from "motion";
import { Container, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat, randomItem } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { compositionConfig } from "./composition.config";

export class WebcamAsset extends Container {
  private videoElement: HTMLVideoElement | undefined;
  private sprite: Sprite | undefined;
  private currentCornerIndex = 0;
  private running = false;

  public async init() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      await this.videoElement.play();

      const source = new VideoSource({ resource: this.videoElement });
      const texture = new Texture({ source });
      this.sprite = new Sprite({ texture, anchor: 0.5 });
      this.addChild(this.sprite);
      this.running = true;
      this.jumpLoop();
    } catch (error) {
      console.warn("Webcam access denied or unavailable:", error);
    }
  }

  public stop() {
    this.running = false;
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    this.videoElement = undefined;
    this.sprite?.destroy();
    this.sprite = undefined;
  }

  public resize(bounds: { width: number; height: number }) {
    if (!this.sprite) return;
    const targetWidth = bounds.width * compositionConfig.webcam.scale;
    const scale = targetWidth / this.sprite.texture.width;
    this.sprite.scale.set(scale);
    this.moveToCorner(bounds, this.currentCornerIndex);
  }

  private async jumpLoop() {
    while (this.running) {
      await waitFor(randomFloat(
        compositionConfig.webcam.jumpInterval.min,
        compositionConfig.webcam.jumpInterval.max,
      ));
      if (!this.running) break;

      const corners = compositionConfig.webcam.corners.length;
      let next = this.currentCornerIndex;
      while (next === this.currentCornerIndex) {
        next = Math.floor(Math.random() * corners);
      }
      this.currentCornerIndex = next;
      this.moveToCorner(
        { width: this.parent?.width ?? 1920, height: this.parent?.height ?? 1080 },
        this.currentCornerIndex,
        true,
      );
    }
  }

  private moveToCorner(
    bounds: { width: number; height: number },
    cornerIndex: number,
    animateMove = false,
  ) {
    if (!this.sprite) return;
    const margin = compositionConfig.webcam.margin;
    const w = this.sprite.width;
    const h = this.sprite.height;

    let x = margin + w * 0.5;
    let y = margin + h * 0.5;

    const corner = compositionConfig.webcam.corners[cornerIndex];
    if (corner === "top-right" || corner === "bottom-right") x = bounds.width - margin - w * 0.5;
    if (corner === "bottom-left" || corner === "bottom-right") y = bounds.height - margin - h * 0.5;

    if (animateMove) {
      animate(this, { x, y }, { duration: 0.8, ease: "backOut" });
    } else {
      this.position.set(x, y);
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/WebcamAsset.ts
git commit -m "feat: add webcam asset"
```

---

## Task 7: Wire up the composition screen

**Files:**
- Create: `src/app/screens/main/CompositionScreen.ts`
- Delete: `src/app/screens/main/MainScreen.ts`
- Delete: `src/app/screens/main/Bouncer.ts`
- Delete: `src/app/screens/main/Logo.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create CompositionScreen**

```ts
import type { Ticker } from "pixi.js";
import { Assets, Container, Texture } from "pixi.js";

import { engine } from "../../getEngine";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../manifest.json";
import { AssetSpawner } from "./composition/AssetSpawner";
import { BackgroundLayer } from "./composition/BackgroundLayer";
import { compositionConfig } from "./composition/composition.config";
import { WebcamAsset } from "./composition/WebcamAsset";

export class CompositionScreen extends Container {
  public static assetBundles = ["main"];

  private background: BackgroundLayer;
  private assetLayer: Container;
  private spawner: AssetSpawner;
  private webcam: WebcamAsset;
  private bounds = { width: 1920, height: 1080 };

  constructor() {
    super();

    this.background = new BackgroundLayer();
    this.addChild(this.background);

    this.assetLayer = new Container();
    this.addChild(this.assetLayer);

    this.spawner = new AssetSpawner(this.assetLayer);

    this.webcam = new WebcamAsset();
    this.addChild(this.webcam);

    this.setupKeyboard();
  }

  public async prepare() {
    await this.setBackground();
  }

  public async show() {
    engine().audio.bgm.play("main/sounds/bgm-main.mp3", { volume: 0.5 });
    await this.webcam.init();
    this.spawner.start(this.bounds);
  }

  public update(ticker: Ticker) {
    this.spawner.update(ticker, this.bounds);
  }

  public pause() {
    this.spawner.pause();
  }

  public resume() {
    this.spawner.resume();
  }

  public reset() {
    this.spawner.clear();
  }

  public resize(width: number, height: number) {
    this.bounds = { width, height };
    this.background.resize(width, height);
    this.webcam.resize(this.bounds);
  }

  public async hide() {
    this.spawner.stop();
    this.spawner.clear();
    this.webcam.stop();
  }

  private async setBackground() {
    let backgroundKey: string | undefined;

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
        const firstSrc = srcs[0];
        const aliases = Array.isArray(asset.alias) ? asset.alias : [asset.alias];
        const name = firstSrc.split("/").pop()?.split(".")[0] ?? "";

        if (name === compositionConfig.backgroundAssetName) {
          backgroundKey = aliases[0] ?? firstSrc;
          break;
        }
      }
      if (backgroundKey) break;
    }

    if (!backgroundKey) {
      for (const bundle of manifest.bundles) {
        for (const asset of bundle.assets) {
          const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
          const firstSrc = srcs[0];
          const lower = firstSrc.toLowerCase();
          const aliases = Array.isArray(asset.alias) ? asset.alias : [asset.alias];
          if (
            lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
            lower.endsWith(".webp") || lower.endsWith(".svg") ||
            lower.endsWith(".mp4") || lower.endsWith(".webm")
          ) {
            backgroundKey = aliases[0] ?? firstSrc;
            break;
          }
        }
        if (backgroundKey) break;
      }
    }

    if (backgroundKey) {
      const texture = await Assets.load<Texture>(backgroundKey);
      await this.background.setBackground(texture);
    }
  }

  private setupKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (this.spawner.isPaused) {
          this.spawner.resume();
        } else {
          this.spawner.pause();
        }
      }
      if (event.code === "KeyR") {
        this.reset();
      }
    });
  }
}
```

- [ ] **Step 2: Delete template files**

```bash
rm src/app/screens/main/MainScreen.ts src/app/screens/main/Bouncer.ts src/app/screens/main/Logo.ts
```

- [ ] **Step 3: Update main.ts**

Modify `src/main.ts`:

```ts
import { setEngine } from "./app/getEngine";
import { LoadScreen } from "./app/screens/LoadScreen";
import { CompositionScreen } from "./app/screens/main/CompositionScreen";
import { userSettings } from "./app/utils/userSettings";
import { CreationEngine } from "./engine/engine";

import "@pixi/sound";

const engine = new CreationEngine();
setEngine(engine);

(async () => {
  await engine.init({
    background: "#1E1E1E",
    resizeOptions: { minWidth: 1920, minHeight: 1080, letterbox: false },
  });

  userSettings.init();

  await engine.navigation.showScreen(LoadScreen);
  await engine.navigation.showScreen(CompositionScreen);
})();
```

- [ ] **Step 4: Verify build and lint**

Run: `npm run build`
Expected: passes

Run: `npm run lint`
Expected: passes

- [ ] **Step 5: Commit**

```bash
git add src/app/screens/main/CompositionScreen.ts src/main.ts src/app/screens/main/composition/AssetSpawner.ts
git add -u src/app/screens/main/
git commit -m "feat: wire up composition screen"
```

---

## Task 8: Manual verification

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Verify background**

Background image/video covers the full canvas and does not move.

- [ ] **Step 3: Verify random assets**

Assets spawn at intervals, move with behaviors, and fade out.

- [ ] **Step 4: Verify webcam**

Webcam feed appears in a corner and occasionally jumps to another corner.

- [ ] **Step 5: Verify keyboard controls**

- Press `Space` to pause/resume spawning.
- Press `R` to clear spawned assets.

- [ ] **Step 6: Commit verification notes**

No code changes expected. Mark task complete in the plan.

---

## Self-Review

1. **Spec coverage:**
   - Static background → Task 2
   - Auto-discovery of assets → Task 5
   - Random text/image/GIF/video spawns → Tasks 4 + 5
   - Motion behaviors → Task 3
   - Webcam with jumps → Task 6
   - Keyboard controls → Task 7
   - Full-window canvas → Task 7 (resize)

2. **Placeholder scan:** No TBD/TODO. All code shown.

3. **Type consistency:** `compositionConfig` shape is consistent across tasks. `CompositionAsset` receives `(Container, bounds)`. `AssetSpawner` exposes `isPaused` getter. `Ticker` is imported as a type in `AssetSpawner`. Video source element accessed via `source.resource` per PixiJS v8 API.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-12-realtime-composition-plan.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach do you want?
