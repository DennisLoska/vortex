import { Assets, Container, Sprite, Texture, VideoSource } from "pixi.js";
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

export class AssetSpawner {
  private container: Container;
  private assets: CompositionAsset[] = [];
  private pool: PoolEntry[] = [];
  private paused = false;
  private running = false;

  private readonly gridCols = 4;
  private readonly gridRows = 3;
  private occupiedCells = new Set<number>();
  private assetCellMap = new Map<CompositionAsset, number>();
  private blockedCell = -1;
  private dyingAssets: CompositionAsset[] = [];

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
    for (const asset of this.dyingAssets) {
      asset.dispose();
    }
    this.assets = [];
    this.dyingAssets = [];
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

    for (let i = this.dyingAssets.length - 1; i >= 0; i--) {
      const asset = this.dyingAssets[i];
      asset.update(ticker, bounds, globalTime);
      if (asset.isDead) {
        this.container.removeChild(asset.view);
        this.dyingAssets.splice(i, 1);
      }
    }
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

  public setBlockedCell(cellIdx: number) {
    this.blockedCell = cellIdx;
  }

  private pickGridCell(bounds: { width: number; height: number }): {
    x: number;
    y: number;
    cellIdx: number;
  } {
    const freeCells: number[] = [];
    for (let i = 0; i < this.gridCols * this.gridRows; i++) {
      if (!this.occupiedCells.has(i) && i !== this.blockedCell)
        freeCells.push(i);
    }

    const cellIdx =
      freeCells.length > 0
        ? freeCells[Math.floor(Math.random() * freeCells.length)]
        : -1;

    this.occupiedCells.add(cellIdx);

    const padX = 350;
    const padY = 350;
    const areaW = Math.max(1, bounds.width - padX * 2);
    const areaH = Math.max(1, bounds.height - padY * 2);
    const col = cellIdx % this.gridCols;
    const row = Math.floor(cellIdx / this.gridCols);
    const cellW = areaW / this.gridCols;
    const cellH = areaH / this.gridRows;

    const x =
      padX + cellW * col + cellW * 0.5 + (Math.random() - 0.5) * cellW * 0.4;
    const y =
      padY + cellH * row + cellH * 0.5 + (Math.random() - 0.5) * cellH * 0.4;

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
        oldest.startDying();
        this.dyingAssets.push(oldest);
      }
    }

    const { view, profile } = await this.createView();
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

  private async createView(): Promise<{
    view: Container;
    profile: AnimationProfile;
  }> {
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
