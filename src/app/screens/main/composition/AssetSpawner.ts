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
  private texCache = new Map<string, Texture>();
  private spawnGen = 0;
  private extents = new Map<CompositionAsset, { hw: number; hh: number }>();

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
    this.spawnGen++;
    this.buildPool(projectName);
  }

  public async start(bounds: { width: number; height: number }) {
    if (this.running) return;
    this.running = true;
    const gen = ++this.spawnGen;
    while (this.running && gen === this.spawnGen) {
      if (!this.paused) {
        await this.spawn(bounds, gen);
        if (gen !== this.spawnGen) return;
      }
      const interval = randomFloat(
        compositionConfig.spawnInterval.min,
        compositionConfig.spawnInterval.max,
      );
      await waitFor(interval);
    }
  }

  public stop() {
    this.spawnGen++;
    this.running = false;
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
  }

  public clear() {
    this.spawnGen++;
    for (const asset of this.assets) {
      this.extents.delete(asset);
      asset.dispose();
    }
    for (const asset of this.dyingAssets) {
      this.extents.delete(asset);
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
        this.extents.delete(asset);
        this.assets.splice(i, 1);
      }
    }

    for (let i = this.dyingAssets.length - 1; i >= 0; i--) {
      const asset = this.dyingAssets[i];
      asset.update(ticker, bounds, globalTime);
      if (asset.isDead) {
        this.extents.delete(asset);
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

  private async spawn(bounds: { width: number; height: number }, gen?: number) {
    if (this.pool.length === 0) return;
    const activeGen = gen ?? this.spawnGen;
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
      hw?: number;
      hh?: number;
    };
    try {
      result = await this.createView();
    } catch {
      return;
    }
    if (activeGen !== this.spawnGen) {
      result.view?.destroy({
        children: true,
        texture: false,
        textureSource: false,
      });
      result.cleanup?.();
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
    this.extents.set(asset, {
      hw: result.hw ?? 150,
      hh: result.hh ?? 150,
    });
    this.container.addChild(view);

    if (this.overlapsCached(gridPos.x, gridPos.y, asset)) {
      this.assetCellMap.delete(asset);
      this.extents.delete(asset);
      asset.dispose();
      return;
    }

    this.assets.push(asset);
  }

  private overlapsCached(
    x: number,
    y: number,
    self: CompositionAsset,
  ): boolean {
    const e = this.extents.get(self);
    if (!e) return false;
    for (const existing of this.assets) {
      if (existing === self) continue;
      const o = this.extents.get(existing);
      if (!o) continue;
      const dx = Math.abs(existing.view.x - x);
      const dy = Math.abs(existing.view.y - y);
      if (dx < e.hw + o.hw && dy < e.hh + o.hh) return true;
    }
    return false;
  }

  private async loadTextureCached(key: string): Promise<Texture> {
    let t = this.texCache.get(key);
    if (!t) {
      t = await Assets.load<Texture>(key);
      this.texCache.set(key, t);
    }
    return t;
  }

  private async createView(): Promise<{
    view: Container | null;
    profile: AnimationProfile;
    cleanup?: () => void;
    hw?: number;
    hh?: number;
  }> {
    try {
      const entry = this.pool[Math.floor(Math.random() * this.pool.length)];

      if (entry.type === "gif") {
        const source = await Assets.load(entry.key);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        const s = 0.35 + Math.random() * 0.4;
        gif.scale.set(s);
        const hw = ((source.width || 400) * s) / 2;
        const hh = ((source.height || 400) * s) / 2;
        return { view: gif, profile: "pop", hw, hh };
      }

      if (entry.type === "video") {
        const texture = await this.loadTextureCached(entry.key);
        const source = texture.source as VideoSource;
        const videoElement = source?.resource as HTMLVideoElement | undefined;
        if (videoElement) {
          videoElement.loop = true;
          videoElement.muted = true;
          void videoElement.play().catch(() => {});
        } else {
          console.warn("Video resource not ready:", entry.key);
        }
        const scale = 0.35 + Math.random() * 0.4;
        const video = new Sprite({ texture, anchor: 0.5 });
        video.scale.set(scale);
        const cleanup = () => {
          if (videoElement && !videoElement.paused) {
            videoElement.pause();
          }
        };
        return {
          view: video,
          profile: "gentle",
          cleanup,
          hw: (texture.width * scale) / 2,
          hh: (texture.height * scale) / 2,
        };
      }

      const texture = await this.loadTextureCached(entry.key);
      const scale = 0.35 + Math.random() * 0.4;
      const sprite = new Sprite({ texture, anchor: 0.5 });
      sprite.scale.set(scale);
      // Upload ahead to avoid first-frame hitch when possible
      return {
        view: sprite,
        profile: "gentle",
        hw: (texture.width * scale) / 2,
        hh: (texture.height * scale) / 2,
      };
    } catch (err) {
      console.error("Failed to create asset view:", err);
      return { view: null, profile: "gentle" };
    }
  }
}
