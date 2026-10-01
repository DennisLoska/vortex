import type { Ticker, Texture } from "pixi.js";
import { ColorMatrixFilter, Color, Container, Rectangle } from "pixi.js";

import { engine } from "../../getEngine";
import { getProjectNames } from "../../assetManifest";
import { AssetSpawner } from "./composition/AssetSpawner";
import { BackgroundLayer } from "./composition/BackgroundLayer";
import { FixedAssetLayer } from "./composition/FixedAssetLayer";
import { TextOverlay } from "./composition/TextOverlay";
import { StatusOverlay } from "./composition/StatusOverlay";
import { WebcamAsset } from "./composition/WebcamAsset";
import { SceneBuilder } from "../../scene-builder/SceneBuilder";
import { CompositionAPI } from "../../composition-api/CompositionAPI";
import { ChatSidebar } from "../../chat-sidebar/ChatSidebar";

let _activeProject: string | null = null;

export class CompositionScreen extends Container {
  private background: BackgroundLayer;
  private assetLayer: Container;
  private spawner: AssetSpawner;
  private fixedLayer: FixedAssetLayer;
  private textOverlay: TextOverlay;
  private statusOverlay: StatusOverlay;
  private webcam: WebcamAsset;
  private bounds = { width: 1920, height: 1080 };
  private paused = false;
  private globalTime = 0;
  private assetThemeFilter = new ColorMatrixFilter();
  private webcamThemeFilter = new ColorMatrixFilter();
  private lastThemeAt = 0;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;
  private projects = getProjectNames();
  private currentProject: string;
  private compositionAPI: CompositionAPI;
  private sceneBuilder: SceneBuilder | null = null;
  private chatSidebar: ChatSidebar;

  constructor() {
    super();

    if (!_activeProject || !this.projects.includes(_activeProject)) {
      _activeProject = this.projects[0];
    }
    this.currentProject = _activeProject;

    this.background = new BackgroundLayer();
    this.addChild(this.background);

    this.assetLayer = new Container();
    this.addChild(this.assetLayer);

    this.spawner = new AssetSpawner(this.assetLayer);
    this.spawner.setProject(this.currentProject);

    this.fixedLayer = new FixedAssetLayer();
    this.addChild(this.fixedLayer);

    this.webcam = new WebcamAsset();
    this.addChild(this.webcam);

    this.textOverlay = new TextOverlay();
    this.textOverlay.setProject(this.currentProject);
    this.addChild(this.textOverlay);

    this.statusOverlay = new StatusOverlay();
    this.addChild(this.statusOverlay);

    this.setupKeyboard();

    this.assetLayer.filters = [this.assetThemeFilter];
    this.webcam.filters = [this.webcamThemeFilter];
    // Static decor caches well; asset/webcam stay dynamic for VJ motion.
    this.fixedLayer.cacheAsTexture(false);

    this.compositionAPI = new CompositionAPI(
      this.background,
      this.assetLayer,
      this.fixedLayer,
      this.statusOverlay,
      this.webcam,
      this.textOverlay,
      this.currentProject,
    );
    this.sceneBuilder = new SceneBuilder(
      this.compositionAPI,
      this.currentProject,
    );
    this.chatSidebar = new ChatSidebar(this.compositionAPI);
  }

  private webcamInitialized = false;

  public async prepare() {
    await this.background.setMultipleBackgrounds(this.currentProject);
    this.background.onNewBackground = (texture) => {
      this.extractAndApplyTheme(texture);
    };
    await this.fixedLayer.setProject(this.currentProject);
    await this.textOverlay.loadPhrases();
    await this.textOverlay.loadVoices();
    if (!this.webcamInitialized) {
      await this.webcam.init();
      this.webcamInitialized = true;
    }
  }

  private extractAndApplyTheme(texture: Texture) {
    // Throttle CPU readback: max 1 per 2s, cheap downsample loop.
    const now = performance.now();
    if (now - this.lastThemeAt < 2000) return;
    this.lastThemeAt = now;
    try {
      const result = engine().renderer.extract.pixels(texture);
      const px = result.pixels;
      let r = 0,
        g = 0,
        b = 0,
        count = 0;
      // Stride 16 bytes (every 4th pixel) is enough for avg tint.
      for (let i = 0; i < px.length; i += 16) {
        r += px[i];
        g += px[i + 1];
        b += px[i + 2];
        count++;
      }
      if (count === 0) return;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      const avg = new Color([r / 255, g / 255, b / 255]).toNumber();
      for (const f of [this.assetThemeFilter, this.webcamThemeFilter]) {
        f.reset();
        f.tint(avg);
        f.alpha = 0.5;
      }
    } catch {
      // extraction fails silently on some GPU/configs
    }
  }

  public async show() {
    this.bounds = { width: window.innerWidth, height: window.innerHeight };
    this.background.resize(this.bounds.width, this.bounds.height);
    this.textOverlay.resize(this.bounds.width, this.bounds.height);
    this.webcam.resize(this.bounds);
    this.updateFilterAreas();
    engine().audio.bgm.play("main/sounds/bgm-main.mp3", { volume: 0.5 });
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
    this.fixedLayer.resize(width, height);
    this.textOverlay.resize(width, height);
    this.statusOverlay.resize(width, height);
    this.webcam.resize(this.bounds);
    this.updateFilterAreas();
  }

  private updateFilterAreas() {
    const area = new Rectangle(0, 0, this.bounds.width, this.bounds.height);
    this.assetLayer.filterArea = area;
    this.webcam.filterArea = area;
  }

  public async hide() {
    this.paused = false;
    this.spawner.stop();
    this.spawner.clear();
    this.fixedLayer.clear();
    this.webcam.stop();
  }

  private async switchProject(name: string) {
    _activeProject = name;
    await this.hide();
    this.currentProject = name;
    this.compositionAPI.setProject(name);
    this.spawner.setProject(name);
    this.textOverlay.setProject(name);
    this.sceneBuilder?.setProject(name);
    this.fixedLayer.clear();
    this.background.dispose();
    await this.prepare();
    await this.show();
  }

  public destroy(options?: object): void {
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
    this.webcam.stop();
    super.destroy(options);
  }

  private setupKeyboard() {
    this.keyHandler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
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
      if (event.code === "KeyT") {
        event.preventDefault();
        this.webcam.toggleAnimation();
      }
      if (event.shiftKey && event.code === "KeyH") {
        event.preventDefault();
        this.assetLayer.visible = !this.assetLayer.visible;
      } else if (event.code === "KeyH") {
        event.preventDefault();
        this.webcam.visible = !this.webcam.visible;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        this.sceneBuilder?.toggle();
      }
      if (event.code === "KeyP") {
        event.preventDefault();
        this.chatSidebar?.toggle();
      }

      const num = parseInt(event.key);
      if (
        num >= 1 &&
        num <= 9 &&
        num <= this.projects.length &&
        this.projects[num - 1] !== this.currentProject
      ) {
        event.preventDefault();
        this.switchProject(this.projects[num - 1]);
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }
}
