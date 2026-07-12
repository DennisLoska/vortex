import type { Ticker } from "pixi.js";
import { Container } from "pixi.js";

import { engine } from "../../getEngine";
import { AssetSpawner } from "./composition/AssetSpawner";
import { BackgroundLayer } from "./composition/BackgroundLayer";
import { TextOverlay } from "./composition/TextOverlay";
import { WebcamAsset } from "./composition/WebcamAsset";

export class CompositionScreen extends Container {
  public static assetBundles = ["main"];

  private background: BackgroundLayer;
  private assetLayer: Container;
  private spawner: AssetSpawner;
  private textOverlay: TextOverlay;
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

    this.textOverlay = new TextOverlay();
    this.addChild(this.textOverlay);

    this.webcam = new WebcamAsset();
    this.addChild(this.webcam);

    this.setupKeyboard();
  }

  public async prepare() {
    await this.background.setMultipleBackgrounds();
    await this.textOverlay.loadPhrases();
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

    const textPos = this.textOverlay.textPosition;
    if (textPos) {
      const cellW = this.bounds.width / 4;
      const cellH = this.bounds.height / 3;
      const col = Math.floor(textPos.x / cellW);
      const row = Math.floor(textPos.y / cellH);
      this.spawner.setBlockedCell(row * 4 + col);
    }

    this.spawner.update(ticker, this.bounds, this.globalTime);
    this.textOverlay.update(dt);
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
    this.textOverlay.resize(width, height);
    this.webcam.resize(this.bounds);
  }

  public async hide() {
    this.paused = false;
    this.spawner.stop();
    this.spawner.clear();
    this.webcam.stop();
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
      if (event.shiftKey && event.code === "KeyN") {
        event.preventDefault();
        this.textOverlay.next();
      }
      if (event.code === "KeyN" && !event.shiftKey) {
        this.webcam.nextPreset();
      }
      if (event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        this.assetLayer.visible = !this.assetLayer.visible;
      } else if (event.code === "KeyH") {
        event.preventDefault();
        this.webcam.visible = !this.webcam.visible;
      }
    });
  }
}
