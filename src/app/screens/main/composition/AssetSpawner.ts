import { Assets, Container, Sprite, Texture, VideoSource } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Ticker } from "pixi.js";

import { getProjectAssets, type PoolEntry } from "../../../assetManifest";

import { randomFloat } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { CompositionAsset } from "./CompositionAsset";
import {
  compositionConfig,
  GRID_PADDING,
  type AnimationProfile,
} from "./composition.config";

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
  }

  public get isPaused() {
    return this.paused;
  }

  public setProject(projectName: string) {
    this.buildPool(projectName);
  }

  public async start(bounds: { width: number; height: number }) {
    if (this.running) return;
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
    this.occupiedCells.clear();
    this.blockedCell = -1;
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
        this.assets.splice(i, 1);
      }
    }

    for (let i = this.dyingAssets.length - 1; i >= 0; i--) {
      const asset = this.dyingAssets[i];
      asset.update(ticker, bounds, globalTime);
      if (asset.isDead) {
        this.dyingAssets.splice(i, 1);
      }
    }
  }

  private buildPool(projectName: string) {
    this.pool = getProjectAssets(projectName);
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

    if (cellIdx >= 0) {
      this.occupiedCells.add(cellIdx);
    }

    const areaW = Math.max(1, bounds.width - GRID_PADDING * 2);
    const areaH = Math.max(1, bounds.height - GRID_PADDING * 2);
    const col = cellIdx % this.gridCols;
    const row = Math.floor(cellIdx / this.gridCols);
    const cellW = areaW / this.gridCols;
    const cellH = areaH / this.gridRows;

    const x =
      GRID_PADDING +
      cellW * col +
      cellW * 0.5 +
      (Math.random() - 0.5) * cellW * 0.4;
    const y =
      GRID_PADDING +
      cellH * row +
      cellH * 0.5 +
      (Math.random() - 0.5) * cellH * 0.4;

    return { x, y, cellIdx };
  }

  private async spawn(bounds: { width: number; height: number }) {
    if (this.pool.length === 0) return;
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

    let result: {
      view: Container | null;
      profile: AnimationProfile;
      cleanup?: () => void;
    };
    try {
      result = await this.createView();
    } catch {
      return;
    }
    const { view, profile, cleanup } = result;
    if (!view) return;

    const gridPos = this.pickGridCell(bounds);
    const asset = new CompositionAsset(
      view,
      bounds,
      profile,
      gridPos.x,
      gridPos.y,
      cleanup,
    );
    this.assetCellMap.set(asset, gridPos.cellIdx);
    this.container.addChild(view);

    if (this.overlapsAny(view)) {
      this.assetCellMap.delete(asset);
      asset.dispose();
      return;
    }

    this.assets.push(asset);
  }

  private overlapsAny(view: Container): boolean {
    const b = view.getBounds();
    for (const existing of this.assets) {
      const eb = existing.view.getBounds();
      if (
        b.x < eb.x + eb.width &&
        b.x + b.width > eb.x &&
        b.y < eb.y + eb.height &&
        b.y + b.height > eb.y
      ) {
        return true;
      }
    }
    return false;
  }

  private async createView(): Promise<{
    view: Container | null;
    profile: AnimationProfile;
    cleanup?: () => void;
  }> {
    try {
      const entry = this.pool[Math.floor(Math.random() * this.pool.length)];

      if (entry.type === "gif") {
        const source = await Assets.load(entry.key);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        gif.scale.set(0.35 + Math.random() * 0.4);
        return { view: gif, profile: "pop" };
      }

      if (entry.type === "video") {
        const texture = await Assets.load<Texture>(entry.key);
        const source = texture.source as VideoSource;
        const videoElement = source?.resource;
        if (videoElement) {
          videoElement.loop = true;
          videoElement.play();
        } else {
          console.warn("Video resource not ready:", entry.key);
        }
        const video = new Sprite({ texture, anchor: 0.5 });
        video.scale.set(0.35 + Math.random() * 0.4);
        const cleanup = () => {
          if (videoElement && !videoElement.paused) {
            videoElement.pause();
          }
        };
        return { view: video, profile: "gentle", cleanup };
      }

      const texture = await Assets.load<Texture>(entry.key);
      const sprite = new Sprite({ texture, anchor: 0.5 });
      sprite.scale.set(0.35 + Math.random() * 0.4);
      return { view: sprite, profile: "gentle" };
    } catch (err) {
      console.error("Failed to create asset view:", err);
      return { view: null, profile: "gentle" };
    }
  }
}
