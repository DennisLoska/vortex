import { Assets, Container, Sprite, Texture } from "pixi.js";
import { GifSprite } from "pixi.js/gif";

export type FixedAssetConfig = {
  file: string;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  zIndex?: number;
};

export class FixedAsset extends Container {
  public readonly alias: string;
  private sprite: Sprite | GifSprite;
  private dragging = false;
  private dragOffset = { x: 0, y: 0 };
  private preset: FixedAssetConfig;
  private boundsWidth = 1920;
  private boundsHeight = 1080;

  private constructor(
    alias: string,
    sprite: Sprite | GifSprite,
    preset: FixedAssetConfig,
  ) {
    super();
    this.alias = alias;
    this.sprite = sprite;
    this.preset = preset;
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);
    this.eventMode = "static";
    this.cursor = "grab";
    this.applyPreset();
    this.setupDrag();
  }

  static async load(alias: string, preset: FixedAssetConfig) {
    const ext = alias.split(".").pop()?.toLowerCase();
    if (ext === "gif") {
      const source = await Assets.load(alias);
      const gif = new GifSprite({ source, autoPlay: true });
      return new FixedAsset(alias, gif, preset);
    }
    const texture = await Assets.load<Texture>(alias);
    return new FixedAsset(alias, new Sprite({ texture }), preset);
  }

  private applyPreset() {
    this.x = this.boundsWidth * this.preset.x;
    this.y = this.boundsHeight * this.preset.y;
    if (this.preset.scale !== undefined)
      this.sprite.scale.set(this.preset.scale);
    if (this.preset.rotation !== undefined)
      this.sprite.rotation = this.preset.rotation;
    if (this.preset.zIndex !== undefined) this.zIndex = this.preset.zIndex;
  }

  private setupDrag() {
    this.on("pointerdown", (e) => {
      this.dragging = true;
      this.cursor = "grabbing";
      const parent = this.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      this.dragOffset = { x: this.x - pos.x, y: this.y - pos.y };
    });

    this.on("globalpointermove", (e) => {
      if (!this.dragging) return;
      const parent = this.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      this.x = pos.x + this.dragOffset.x;
      this.y = pos.y + this.dragOffset.y;
    });

    const stopDrag = () => {
      this.dragging = false;
      this.cursor = "grab";
    };
    this.on("pointerup", stopDrag);
    this.on("pointerupoutside", stopDrag);
  }

  public get spriteScale(): number {
    return this.sprite.scale.x;
  }

  public set spriteScale(value: number) {
    this.sprite.scale.set(value);
  }

  public resize(width: number, height: number) {
    this.boundsWidth = width;
    this.boundsHeight = height;
    this.applyPreset();
  }
}
