import type { Ticker } from "pixi.js";
import { Assets, Container, Texture } from "pixi.js";

import { engine } from "../../getEngine";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../manifest.json";
import { AssetSpawner } from "./composition/AssetSpawner";
import { BackgroundLayer } from "./composition/BackgroundLayer";
import { WebcamAsset } from "./composition/WebcamAsset";

export class CompositionScreen extends Container {
  public static assetBundles = ["main"];

  private background: BackgroundLayer;
  private assetLayer: Container;
  private spawner: AssetSpawner;
  private webcam: WebcamAsset;
  private bounds = { width: 1920, height: 1080 };
  private paused = false;
  private globalTime = 0;

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
    await this.setBackgrounds();
  }

  public async show() {
    engine().audio.bgm.play("main/sounds/bgm-main.mp3", { volume: 0.5 });
    await this.webcam.init();
    this.spawner.start(this.bounds);
  }

  public update(ticker: Ticker) {
    if (this.paused) return;
    const dt = ticker.deltaMS / 1000;
    this.globalTime += dt;
    this.spawner.update(ticker, this.bounds, this.globalTime);
    this.webcam.update(ticker);
    this.background.update(dt);
  }

  public async pause() {
    this.paused = true;
    this.spawner.pause();
  }

  public async resume() {
    this.paused = false;
    this.spawner.resume();
  }

  public togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
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
    this.paused = false;
    this.spawner.stop();
    this.spawner.clear();
    this.webcam.stop();
  }

  private async setBackgrounds() {
    const bgKeys: string[] = [];

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
        const firstSrc = srcs[0];
        const aliases = Array.isArray(asset.alias)
          ? asset.alias
          : [asset.alias];

        // collect all background videos
        if (firstSrc.startsWith("main/backgrounds/")) {
          bgKeys.push(aliases[0] ?? firstSrc);
        }
      }
    }

    // fall back to any single image/video if no backgrounds found
    if (bgKeys.length === 0) {
      for (const bundle of manifest.bundles) {
        for (const asset of bundle.assets) {
          const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
          const firstSrc = srcs[0];
          const fallbackAliases = Array.isArray(asset.alias)
            ? asset.alias
            : [asset.alias];
          const lower = firstSrc.toLowerCase();
          if (lower.endsWith(".png") || lower.endsWith(".jpg")) {
            bgKeys.push(fallbackAliases[0] ?? firstSrc);
            break;
          }
        }
      }
    }

    // load all and pick one to start, then schedule transitions
    for (const key of bgKeys) {
      const texture = await Assets.load<Texture>(key);
      await this.background.setBackground(texture);
    }

    if (bgKeys.length > 0) {
      this.background.transitionToRandom();
    }
  }

  private setupKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        this.togglePause();
      }
      if (event.code === "KeyR") {
        this.reset();
      }
      if (event.code === "KeyN") {
        this.webcam.nextPreset();
      }
    });
  }
}
