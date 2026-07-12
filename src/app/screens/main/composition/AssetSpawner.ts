import { Assets, Container, Sprite, Text, Texture, VideoSource } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Ticker } from "pixi.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../../manifest.json";

import { randomFloat } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { CompositionAsset } from "./CompositionAsset";
import { compositionConfig, type AnimationProfile } from "./composition.config";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".m4v", ".ogv", ".mov"];
const GIF_EXTENSION = ".gif";

type PoolEntry = {
  key: string;
  type: "image" | "video" | "gif";
};

const textModules = import.meta.glob("/public/texts/*.txt", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export class AssetSpawner {
  private container: Container;
  private assets: CompositionAsset[] = [];
  private pool: PoolEntry[] = [];
  private phrases: string[] = [];
  private paused = false;
  private running = false;

  private readonly gridCols = 4;
  private readonly gridRows = 3;
  private occupiedCells = new Set<number>();
  private assetCellMap = new Map<CompositionAsset, number>();

  constructor(container: Container) {
    this.container = container;
    this.buildPool();
  }

  public get isPaused() {
    return this.paused;
  }

  public async start(bounds: { width: number; height: number }) {
    await this.loadPhrases();
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

  public update(
    ticker: Ticker,
    bounds: { width: number; height: number },
    globalTime: number,
  ) {
    for (let i = this.assets.length - 1; i >= 0; i--) {
      const asset = this.assets[i];
      asset.update(ticker, bounds, globalTime);
      if (asset.isDead) {
        const cellIdx = this.assetCellMap.get(asset);
        if (cellIdx !== undefined) {
          this.occupiedCells.delete(cellIdx);
          this.assetCellMap.delete(asset);
        }
        this.container.removeChild(asset.view);
        this.assets.splice(i, 1);
      }
    }
  }

  private async loadPhrases() {
    const entries = Object.entries(textModules);
    if (entries.length === 0) return;

    // each file is one phrase — preserve the entire content as-is
    const loaded = await Promise.all(
      entries.map(async ([, loader]) => {
        const raw = await loader();
        return raw.trimEnd();
      }),
    );
    this.phrases = loaded.filter((p) => p.length > 0);
  }

  private buildPool() {
    const seen = new Set<string>();
    const defaultBundle = manifest.bundles.find((b) => b.name === "default");
    const assets = defaultBundle?.assets ?? [];

    for (const asset of assets) {
      const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
      const firstSrc = srcs[0];
      const lower = firstSrc.toLowerCase();
      const aliases = Array.isArray(asset.alias) ? asset.alias : [asset.alias];
      const key = aliases[0] ?? firstSrc;

      if (seen.has(key)) continue;

      // exclude background videos — they belong to BackgroundLayer only
      if (key.startsWith("main/backgrounds/")) continue;

      if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        seen.add(key);
        this.pool.push({ key, type: "image" });
      } else if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        seen.add(key);
        this.pool.push({ key, type: "video" });
      } else if (lower.endsWith(GIF_EXTENSION)) {
        seen.add(key);
        this.pool.push({ key, type: "gif" });
      }
    }
  }

  private pickGridCell(bounds: { width: number; height: number }): {
    x: number;
    y: number;
    cellIdx: number;
  } {
    const freeCells: number[] = [];
    for (let i = 0; i < this.gridCols * this.gridRows; i++) {
      if (!this.occupiedCells.has(i)) freeCells.push(i);
    }

    const cellIdx =
      freeCells.length > 0
        ? freeCells[Math.floor(Math.random() * freeCells.length)]
        : -1;

    this.occupiedCells.add(cellIdx);

    const col = cellIdx % this.gridCols;
    const row = Math.floor(cellIdx / this.gridCols);
    const cellW = bounds.width / this.gridCols;
    const cellH = bounds.height / this.gridRows;

    const x = cellW * col + cellW * 0.5 + (Math.random() - 0.5) * cellW * 0.4;
    const y = cellH * row + cellH * 0.5 + (Math.random() - 0.5) * cellH * 0.4;

    return { x, y, cellIdx };
  }

  private async spawn(bounds: { width: number; height: number }) {
    if (this.assets.length >= compositionConfig.maxAssets) {
      const oldest = this.assets.shift();
      if (oldest) {
        const cellIdx = this.assetCellMap.get(oldest);
        if (cellIdx !== undefined) {
          this.occupiedCells.delete(cellIdx);
          this.assetCellMap.delete(oldest);
        }
        oldest.dispose();
        this.container.removeChild(oldest.view);
      }
    }

    const { view, profile } = await this.createView(bounds);
    if (!view) return;

    const gridPos = this.pickGridCell(bounds);
    const asset = new CompositionAsset(
      view,
      bounds,
      profile,
      gridPos.x,
      gridPos.y,
    );
    this.assetCellMap.set(asset, gridPos.cellIdx);
    this.assets.push(asset);
    this.container.addChild(view);
  }

  private async createView(bounds: { width: number; height: number }): Promise<{
    view: Container;
    profile: AnimationProfile;
  }> {
    const hasMedia = this.pool.length > 0;
    const isText = !hasMedia || Math.random() < 0.25;

    if (isText && this.phrases.length > 0) {
      const phrase =
        this.phrases[Math.floor(Math.random() * this.phrases.length)];

      // measure text to pick appropriate font size and wrap width
      const tempText = new Text({
        text: phrase,
        style: {
          fontFamily: "Caveat, cursive",
          fontSize: 48,
          fill: 0xffffff,
          wordWrap: true,
          wordWrapWidth: bounds.width * 0.6,
        },
      });

      const textHeight = tempText.height;
      tempText.destroy();

      // scale font so the whole block fits nicely on screen
      const maxFontSize = Math.min(
        96,
        (bounds.height * 0.35) / Math.max(textHeight / 48, 1),
      );
      const fontSize = Math.max(28, maxFontSize);

      const text = new Text({
        text: phrase,
        style: {
          fontFamily: "Caveat, cursive",
          fontSize: fontSize,
          fill: 0xffffff,
          wordWrap: true,
          wordWrapWidth: bounds.width * 0.6,
          dropShadow: {
            distance: 2,
            blur: 2,
            color: "#000000",
            alpha: 0.5,
          },
        },
      });
      text.anchor.set(0.5);
      return { view: text, profile: "gentle" };
    }

    const entry = this.pool[Math.floor(Math.random() * this.pool.length)];

    if (entry.type === "gif") {
      const source = await Assets.load(entry.key);
      const gif = new GifSprite({ source, autoPlay: true });
      gif.anchor.set(0.5);
      gif.scale.set(0.35 + Math.random() * 0.4);
      return { view: gif, profile: "lively" };
    }

    if (entry.type === "video") {
      const texture = await Assets.load<Texture>(entry.key);
      const source = texture.source as VideoSource;
      const videoElement = source.resource;
      videoElement.loop = true;
      videoElement?.play?.();
      const video = new Sprite({ texture, anchor: 0.5 });
      video.scale.set(0.35 + Math.random() * 0.4);
      return { view: video, profile: "gentle" };
    }

    const texture = await Assets.load<Texture>(entry.key);
    const sprite = new Sprite({ texture, anchor: 0.5 });
    sprite.scale.set(0.35 + Math.random() * 0.4);
    return { view: sprite, profile: "gentle" };
  }
}
