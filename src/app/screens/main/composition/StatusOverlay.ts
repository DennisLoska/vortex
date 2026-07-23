import {
  Container,
  Graphics,
  Text,
  CanvasSource,
  Texture,
  Sprite,
} from "pixi.js";
import { statusOverlayConfig, StatusOverlayConfig } from "./composition.config";

const HEART_PIXEL_DATA = [
  0b0011001100, 0b0111111110, 0b1111111111, 0b1111111111, 0b0111111110,
  0b0011111100, 0b0001111000, 0b0000110000,
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
  private xpContainer: Container;
  private fullHeartTex: Texture;
  private emptyHeartTex: Texture;

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

    this.xpContainer = new Container();
    this.xpContainer.addChild(this.xpBarBg);
    this.xpContainer.addChild(this.xpBarFill);
    this.xpContainer.addChild(this.xpBarText);
    this.addChild(this.xpContainer);

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

    for (let i = 0; i < this.config.hearts.count; i++) {
      const tex =
        i < this.config.hearts.filled ? this.fullHeartTex : this.emptyHeartTex;
      const sprite = new Sprite({
        texture: tex,
        scale: this.config.hearts.size / HEART_WIDTH,
      });
      sprite.x = i * (this.config.hearts.size + this.config.hearts.spacing);
      this.heartsContainer.addChild(sprite);
    }
  }

  private buildXPBar(): void {
    const cfg = this.config.experienceBar;
    const ratio = cfg.max > 0 ? Math.min(cfg.current / cfg.max, 1) : 0;

    this.xpBarBg.clear();
    if (cfg.width > 0 && cfg.height > 0) {
      this.xpBarBg
        .roundRect(0, 0, cfg.width, cfg.height, 4)
        .fill({ color: cfg.backgroundColor });
    }

    this.xpBarFill.clear();
    const fillWidth = cfg.width * ratio;
    if (fillWidth > 0 && cfg.height > 0) {
      this.xpBarFill
        .roundRect(0, 0, fillWidth, cfg.height, 4)
        .fill({ color: cfg.color });
    }

    this.xpBarText.text = `${cfg.current} / ${cfg.max}`;
    this.xpBarText.x = cfg.width / 2;
    this.xpBarText.y = cfg.height / 2;
  }

  private buildLevel(): void {
    this.levelText.text = `${this.config.level.label} ${this.config.level.current}`;
  }

  public override destroy(options?: {
    children?: boolean;
    texture?: boolean;
  }): void {
    this.fullHeartTex.destroy(true);
    this.emptyHeartTex.destroy(true);
    super.destroy(options);
  }

  public resize(width: number, _height: number): void {
    void _height;
    const pad = this.config.padding;
    const hb = this.config.hearts;

    this.heartsContainer.x = pad;
    this.heartsContainer.y = pad;

    this.xpContainer.x = pad;
    this.xpContainer.y = pad + hb.size + 12;

    this.levelText.x = width - pad;
    this.levelText.y = pad;
    this.levelText.anchor.set(1, 0);
  }
}
