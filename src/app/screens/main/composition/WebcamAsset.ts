import type { Ticker } from "pixi.js";
import { Container, Graphics, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { webcamConfig, webcamPresets } from "./composition.config";

export class WebcamAsset extends Container {
  private videoElement: HTMLVideoElement | undefined;
  private sprite: Sprite | undefined;
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
  }

  public update(ticker: Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.idleTime += dt;

    if (!this.sprite || !this.sprite.texture) return;

    const maskCfg = webcamConfig.mask;
    const w = this.sprite.width;

    // organic breathing scale
    const breathe = Math.sin(this.idleTime * 0.6);
    const breathe2 = Math.sin(this.idleTime * 0.4 + 1.3);
    const breathe3 = Math.sin(this.idleTime * 0.25 + 2.7);

    // subtle scale pulse — never resets to flat
    const scaleRange =
      (maskCfg.idleScalePulse.max - maskCfg.idleScalePulse.min) / 2;
    const scaleMid =
      (maskCfg.idleScalePulse.max + maskCfg.idleScalePulse.min) / 2;
    const combinedBreath = breathe * 0.5 + breathe2 * 0.3 + breathe3 * 0.2;
    this.scale.set(scaleMid + combinedBreath * scaleRange);

    // gentle rotation — multi-frequency for organic feel
    const rot1 = Math.sin(this.idleTime * 0.7) * maskCfg.idleRotationRange;
    const rot2 =
      Math.sin(this.idleTime * 0.35 + 1.8) * (maskCfg.idleRotationRange * 0.4);
    this.rotation = ((rot1 + rot2) / 180) * Math.PI;

    // alpha falloff at edges — creates the smoky dissolve effect
    const edgeFade = maskCfg.edgeFadeRadius ?? 60;
    const halfW = w / 2;

    if (this.sprite.mask) {
      const oldMask = this.sprite.mask as import("pixi.js").Container;
      this.removeChild(oldMask);
      oldMask.destroy({ children: true });
      this.sprite.mask = null;
    }

    // build a soft radial gradient mask using Graphics
    const maskGraphics = new Graphics();
    const cx = 0;
    const cy = 0;

    // draw a large circle that covers the sprite center, with soft falloff via overlapping circles
    // outer ring — full opacity at center, fading to transparent at edges
    for (let r = halfW + edgeFade; r > halfW - edgeFade; r -= 2) {
      const t = (r - (halfW - edgeFade)) / (edgeFade * 2);
      const alpha = Math.max(0, Math.min(1, t));
      maskGraphics
        .circle(cx, cy, r)
        .fill({ color: `rgba(255,255,255,${alpha})` });
    }

    this.addChild(maskGraphics as import("pixi.js").Container);
    this.sprite.mask = maskGraphics;

    // auto-jump timer
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
