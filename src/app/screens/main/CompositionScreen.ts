import type { Ticker } from "pixi.js";
import { Assets, Container, Texture } from "pixi.js";

import { engine } from "../../getEngine";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - dynamically generated file by AssetPack
import manifest from "../../../manifest.json";
import { AssetSpawner } from "./composition/AssetSpawner";
import { BackgroundLayer } from "./composition/BackgroundLayer";
import { compositionConfig } from "./composition/composition.config";
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
    await this.setBackground();
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

  private async setBackground() {
    let backgroundKey: string | undefined;

    for (const bundle of manifest.bundles) {
      for (const asset of bundle.assets) {
        const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
        const firstSrc = srcs[0];
        const aliases = Array.isArray(asset.alias)
          ? asset.alias
          : [asset.alias];
        const name = firstSrc.split("/").pop()?.split(".")[0] ?? "";

        if (name === compositionConfig.backgroundAssetName) {
          backgroundKey = aliases[0] ?? firstSrc;
          break;
        }
      }
      if (backgroundKey) break;
    }

    if (!backgroundKey) {
      for (const bundle of manifest.bundles) {
        for (const asset of bundle.assets) {
          const srcs = Array.isArray(asset.src) ? asset.src : [asset.src];
          const firstSrc = srcs[0];
          const lower = firstSrc.toLowerCase();
          const aliases = Array.isArray(asset.alias)
            ? asset.alias
            : [asset.alias];
          if (
            lower.endsWith(".png") ||
            lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg") ||
            lower.endsWith(".webp") ||
            lower.endsWith(".svg") ||
            lower.endsWith(".mp4") ||
            lower.endsWith(".webm")
          ) {
            backgroundKey = aliases[0] ?? firstSrc;
            break;
          }
        }
        if (backgroundKey) break;
      }
    }

    if (backgroundKey) {
      const texture = await Assets.load<Texture>(backgroundKey);
      await this.background.setBackground(texture);
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
