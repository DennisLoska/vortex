import { Container, Graphics, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { webcamConfig, webcamPresets } from "./composition.config";

export class WebcamAsset extends Container {
  private videoElement: HTMLVideoElement | undefined;
  private sprite: Sprite | undefined;
  private maskGraphics: Graphics;
  private currentPresetIndex = 0;
  private bounds = { width: 1920, height: 1080 };
  private autoJumpTimer = 0;
  private nextAutoJump = randomFloat(
    webcamConfig.autoJumpInterval.min,
    webcamConfig.autoJumpInterval.max,
  );
  private idleTime = 0;

  constructor() {
    super();
    this.maskGraphics = new Graphics();
    this.addChild(this.maskGraphics);
  }

  public async init() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      await this.videoElement.play();

      const source = new VideoSource({ resource: this.videoElement });
      const texture = new Texture({ source });
      this.sprite = new Sprite({ texture, anchor: 0.5 });
      this.addChild(this.sprite);
      this.applyPreset(0);
    } catch (error) {
      console.warn("Webcam access denied or unavailable:", error);
    }
  }

  public stop() {
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    this.videoElement = undefined;
    this.sprite?.destroy();
    this.sprite = undefined;
  }

  public resize(bounds: { width: number; height: number }) {
    this.bounds = bounds;
    if (this.sprite) {
      const preset = webcamPresets[this.currentPresetIndex];
      const w = webcamConfig.mask.width * preset.scale;
      const h = webcamConfig.mask.height * preset.scale;
      this.sprite.width = w;
      this.sprite.height = h;
    }
    this.applyPreset(this.currentPresetIndex);
  }

  public nextPreset() {
    const next = (this.currentPresetIndex + 1) % webcamPresets.length;
    this.applyPreset(next);
  }

  public jumpToRandomPreset() {
    let next = this.currentPresetIndex;
    while (next === this.currentPresetIndex) {
      next = Math.floor(Math.random() * webcamPresets.length);
    }
    this.applyPreset(next);
  }

  private applyPreset(index: number) {
    this.currentPresetIndex = index;
    const preset = webcamPresets[index];
    const w = webcamConfig.mask.width * preset.scale;
    const h = webcamConfig.mask.height * preset.scale;
    this.x = this.bounds.width * preset.x;
    this.y = this.bounds.height * preset.y;

    if (this.sprite) {
      this.sprite.width = w;
      this.sprite.height = h;
    }
    this.drawMask(w, h);
  }

  private drawMask(width: number, height: number) {
    this.maskGraphics.clear();
    this.maskGraphics.roundRect(
      -width / 2,
      -height / 2,
      width,
      height,
      webcamConfig.mask.cornerRadius,
    );
    this.maskGraphics.fill(0xffffff);
    if (this.sprite) {
      this.sprite.mask = this.maskGraphics;
    }
  }

  public update(ticker: import("pixi.js").Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.idleTime += dt;

    const maskCfg = webcamConfig.mask;
    const cycle = Math.sin((this.idleTime / maskCfg.idleCycle) * Math.PI * 2);
    const scaleRange = (maskCfg.idleScalePulse.max - maskCfg.idleScalePulse.min) / 2;
    const scaleMid = (maskCfg.idleScalePulse.max + maskCfg.idleScalePulse.min) / 2;
    this.maskGraphics.scale.set(scaleMid + cycle * scaleRange);
    this.maskGraphics.rotation = cycle * maskCfg.idleRotationRange * (Math.PI / 180);

    this.autoJumpTimer += dt;
    if (this.autoJumpTimer >= this.nextAutoJump) {
      this.jumpToRandomPreset();
      this.autoJumpTimer = 0;
      this.nextAutoJump = randomFloat(
        webcamConfig.autoJumpInterval.min,
        webcamConfig.autoJumpInterval.max,
      );
    }
  }
}
