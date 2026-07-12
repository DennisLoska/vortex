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
        this.container.removeChild(asset.view);
        this.assets.splice(i, 1);
      }
    }
  }

  private async loadPhrases() {
    const entries = Object.entries(textModules);
    if (entries.length === 0) return;

    const loaded = await Promise.all(
      entries.map(async ([, loader]) => {
        const raw = await loader();
        return raw
          .split(/\n\n+/)
          .map((block) => block.trimEnd())
          .filter((block) => block.length > 0);
      }),
    );
    this.phrases = loaded.flat();
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

  private async spawn(bounds: { width: number; height: number }) {
    if (this.assets.length >= compositionConfig.maxAssets) {
      const oldest = this.assets.shift();
      if (oldest) {
        oldest.dispose();
        this.container.removeChild(oldest.view);
      }
    }

    const { view, profile } = await this.createView();
    if (!view) return;

    const asset = new CompositionAsset(view, bounds, profile);
    this.assets.push(asset);
    this.container.addChild(view);
  }

  private async createView(): Promise<{
    view: Container;
    profile: AnimationProfile;
  }> {
    const hasMedia = this.pool.length > 0;
    const isText = !hasMedia || Math.random() < 0.25;

    if (isText && this.phrases.length > 0) {
      const phrase =
        this.phrases[Math.floor(Math.random() * this.phrases.length)];
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
      text.anchor.set(0.5);
      return { view: text, profile: "gentle" };
    }

    const entry = this.pool[Math.floor(Math.random() * this.pool.length)];

    if (entry.type === "gif") {
      const source = await Assets.load(entry.key);
      const gif = new GifSprite({ source, autoPlay: true });
      gif.anchor.set(0.5);
      gif.scale.set(0.25 + Math.random() * 0.5);
      return { view: gif, profile: "lively" };
    }

    if (entry.type === "video") {
      const texture = await Assets.load<Texture>(entry.key);
      const source = texture.source as VideoSource;
      const videoElement = source.resource;
      videoElement.loop = true;
      videoElement?.play?.();
      const video = new Sprite({ texture, anchor: 0.5 });
      video.scale.set(0.25 + Math.random() * 0.5);
      return { view: video, profile: "gentle" };
    }

    const texture = await Assets.load<Texture>(entry.key);
    const sprite = new Sprite({ texture, anchor: 0.5 });
    sprite.scale.set(0.25 + Math.random() * 0.5);
    return { view: sprite, profile: "gentle" };
  }
}
