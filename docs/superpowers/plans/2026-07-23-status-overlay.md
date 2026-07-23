# StatusOverlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a retro pixel-art StatusOverlay (hearts, XP bar, level display) to the composition as a decorative video capture overlay.

**Architecture:** Single `Container` subclass `StatusOverlay` wired into `CompositionScreen` as topmost visual layer. All elements drawn procedurally via PixiJS Graphics + CanvasSource (no assets). Config via typed interface in `composition.config.ts`.

**Tech Stack:** PixiJS v8, TypeScript, CanvasSource for pixel-art heart textures, Graphics for XP bar, Text for level label.

---

### Task 1: Add StatusOverlayConfig to composition.config.ts

**Files:**
- Modify: `src/app/screens/main/composition/composition.config.ts`

- [ ] **Step 1: Read existing composition.config.ts**

Run: `cat src/app/screens/main/composition/composition.config.ts`

- [ ] **Step 2: Add StatusOverlayConfig interface and default config**

Add after the last `export` in the file:

```typescript
export interface StatusOverlayConfig {
  hearts: {
    count: number;
    filled: number;
    size: number;
    spacing: number;
    fullColor: number;
    emptyColor: number;
  };
  experienceBar: {
    current: number;
    max: number;
    width: number;
    height: number;
    color: number;
    backgroundColor: number;
    textColor: number;
  };
  level: {
    current: number;
    fontSize: number;
    color: number;
    label: string;
  };
  padding: number;
}

export const statusOverlayConfig: StatusOverlayConfig = {
  hearts: {
    count: 5,
    filled: 3,
    size: 24,
    spacing: 6,
    fullColor: 0xff0044,
    emptyColor: 0x333333,
  },
  experienceBar: {
    current: 1,
    max: 10,
    width: 220,
    height: 20,
    color: 0x00ff88,
    backgroundColor: 0x222222,
    textColor: 0xffffff,
  },
  level: {
    current: 1,
    fontSize: 32,
    color: 0xffffff,
    label: "LVL",
  },
  padding: 20,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/screens/main/composition/composition.config.ts
git commit -m "feat: add StatusOverlayConfig interface and defaults"
```

---

### Task 2: Create StatusOverlay.ts

**Files:**
- Create: `src/app/screens/main/composition/StatusOverlay.ts`

- [ ] **Step 1: Create StatusOverlay.ts**

Write to `src/app/screens/main/composition/StatusOverlay.ts`:

```typescript
import { Container, Graphics, Text, CanvasSource, Texture, Sprite } from "pixi.js";
import { statusOverlayConfig, StatusOverlayConfig } from "./composition.config";

const HEART_PIXEL_DATA = [
  0b0011001100,
  0b0111111110,
  0b1111111111,
  0b1111111111,
  0b0111111110,
  0b0011111100,
  0b0001111000,
  0b0000110000,
];

const HEART_WIDTH = 10;
const HEART_HEIGHT = 8;

function generateHeartTexture(color: number): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = HEART_WIDTH;
  canvas.height = HEART_HEIGHT;
  const ctx = canvas.getContext("2d")!;

  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;

  for (let y = 0; y < HEART_HEIGHT; y++) {
    const row = HEART_PIXEL_DATA[y];
    for (let x = 0; x < HEART_WIDTH; x++) {
      if (row & (1 << (HEART_WIDTH - 1 - x))) {
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  const source = new CanvasSource({ resource: canvas });
  return new Texture({ source });
}

export class StatusOverlay extends Container {
  private config: StatusOverlayConfig;
  private heartsContainer: Container;
  private xpBarBg: Graphics;
  private xpBarFill: Graphics;
  private xpBarText: Text;
  private levelText: Text;
  private heartSprites: Sprite[] = [];
  private fullHeartTex: Texture;
  private emptyHeartTex: Texture;
  private _screenWidth = 0;
  private _screenHeight = 0;

  constructor() {
    super();
    this.config = { ...statusOverlayConfig };

    this.eventMode = "none";

    this.fullHeartTex = generateHeartTexture(this.config.hearts.fullColor);
    this.emptyHeartTex = generateHeartTexture(this.config.hearts.emptyColor);

    this.heartsContainer = new Container();
    this.addChild(this.heartsContainer);

    this.buildHearts();

    this.xpBarBg = new Graphics();
    this.xpBarFill = new Graphics();
    this.xpBarText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: this.config.experienceBar.height - 4,
        fill: this.config.experienceBar.textColor,
        fontWeight: "bold",
      },
    });
    this.xpBarText.anchor.set(0.5);

    const xpContainer = new Container();
    xpContainer.addChild(this.xpBarBg);
    xpContainer.addChild(this.xpBarFill);
    xpContainer.addChild(this.xpBarText);
    this.addChild(xpContainer);

    this.levelText = new Text({
      text: "",
      style: {
        fontFamily: "monospace",
        fontSize: this.config.level.fontSize,
        fill: this.config.level.color,
        fontWeight: "bold",
        dropShadow: {
          distance: 2,
          blur: 2,
          color: "#000000",
          alpha: 0.6,
        },
      },
    });
    this.addChild(this.levelText);

    this.buildXPBar();
    this.buildLevel();
  }

  private buildHearts(): void {
    this.heartsContainer.removeChildren();
    this.heartSprites = [];

    for (let i = 0; i < this.config.hearts.count; i++) {
      const tex = i < this.config.hearts.filled ? this.fullHeartTex : this.emptyHeartTex;
      const sprite = new Sprite({
        texture: tex,
        scale: this.config.hearts.size / HEART_WIDTH,
      });
      sprite.x = i * (this.config.hearts.size + this.config.hearts.spacing);
      this.heartsContainer.addChild(sprite);
      this.heartSprites.push(sprite);
    }
  }

  private buildXPBar(): void {
    const cfg = this.config.experienceBar;
    const ratio = Math.min(cfg.current / cfg.max, 1);

    this.xpBarBg.clear();
    this.xpBarBg.roundRect(0, 0, cfg.width, cfg.height, 4).fill({ color: cfg.backgroundColor });

    this.xpBarFill.clear();
    this.xpBarFill.roundRect(0, 0, cfg.width * ratio, cfg.height, 4).fill({ color: cfg.color });

    this.xpBarText.text = `${cfg.current} / ${cfg.max}`;
  }

  private buildLevel(): void {
    this.levelText.text = `${this.config.level.label} ${this.config.level.current}`;
  }

  public resize(width: number, height: number): void {
    this._screenWidth = width;
    this._screenHeight = height;

    const pad = this.config.padding;
    const hb = this.config.hearts;

    this.heartsContainer.x = pad;
    this.heartsContainer.y = pad;

    const xpBar = this.children[1];
    xpBar.x = pad;
    xpBar.y = pad + hb.size + 12;

    this.levelText.x = width - pad;
    this.levelText.y = pad;
    this.levelText.anchor.set(1, 0);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/screens/main/composition/StatusOverlay.ts
git commit -m "feat: create StatusOverlay with hearts, XP bar, level display"
```

---

### Task 3: Wire StatusOverlay into CompositionScreen

**Files:**
- Modify: `src/app/screens/main/composition/CompositionScreen.ts`

- [ ] **Step 1: Read CompositionScreen.ts**

Run: `cat src/app/screens/main/composition/CompositionScreen.ts`

- [ ] **Step 2: Add import and instance**

Add import at top:
```typescript
import { StatusOverlay } from "./StatusOverlay";
```

Add property in the CompositionScreen class alongside existing layer properties:
```typescript
private statusOverlay: StatusOverlay;
```

In the constructor or `prepare()` method after all other layers are added:
```typescript
this.statusOverlay = new StatusOverlay();
this.addChild(this.statusOverlay);
```

In the `resize(width, height)` method:
```typescript
this.statusOverlay.resize(width, height);
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/screens/main/composition/CompositionScreen.ts
git commit -m "feat: wire StatusOverlay into CompositionScreen"
```

---

### Task 4: Verify end-to-end

**Files:**
- Check: all modified files

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: `tsc` passes, `vite build` succeeds.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 3: Review final diff**

Run: `git diff`
Expected: Clean, minimal changes across 3 files.
