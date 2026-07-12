import { Assets, Container, Sprite, Text, Texture, VideoSource } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Ticker } from "pixi.js";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../../manifest.json";

import { randomFloat } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { CompositionAsset } from "./CompositionAsset";
import { compositionConfig } from "./composition.config";

const SPAWNABLE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".mp4",
  ".webm",
  ".m4v",
  ".ogv",
  ".mov",
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
          const aliases = Array.isArray(asset.alias)
            ? asset.alias
            : [asset.alias];
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
    const isText =
      Math.random() < compositionConfig.textWeight || this.pool.length === 0;

    if (isText) {
      const phrase =
        compositionConfig.textPhrases[
          Math.floor(Math.random() * compositionConfig.textPhrases.length)
        ];
      const text = new Text({
        text: phrase,
        style: {
          fontFamily: "Arial",
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
      text.anchor.set(0.5);
      return text;
    }

    const key = this.pool[Math.floor(Math.random() * this.pool.length)];
    const lower = key.toLowerCase();

    if (lower.endsWith(".gif")) {
      const source = await Assets.load(key);
      const gif = new GifSprite({ source, autoPlay: true });
      gif.anchor.set(0.5);
      gif.scale.set(0.25 + Math.random() * 0.5);
      return gif;
    }

    if (
      [".mp4", ".webm", ".m4v", ".ogv", ".mov"].some((ext) =>
        lower.endsWith(ext),
      )
    ) {
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
