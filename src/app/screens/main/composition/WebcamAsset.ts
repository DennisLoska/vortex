import type { Ticker } from "pixi.js";
import {
  Container,
  DisplacementFilter,
  Sprite,
  Texture,
  VideoSource,
} from "pixi.js";

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

  // displacement filter for fluid border warping
  private displacementFilter: DisplacementFilter | null = null;
  private displacementSprite: Sprite | undefined;

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
      this.buildDisplacementFilter();
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

  private buildDisplacementFilter() {
    // destroy old filter
    if (this.displacementFilter) {
      if (this.sprite && this.sprite.filters) {
        const filters = [...this.sprite.filters];
        const idx = filters.indexOf(this.displacementFilter);
        if (idx !== -1) {
          filters.splice(idx, 1);
          this.sprite.filters = filters;
        }
      }
      this.displacementFilter.destroy();
      this.displacementFilter = null;
    }

    // destroy old displacement sprite
    if (this.displacementSprite) {
      this.removeChild(this.displacementSprite);
      this.displacementSprite.destroy({ children: true });
      this.displacementSprite = undefined;
    }

    // create an animated noise texture for displacement
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    // fill with mid-gray (neutral displacement)
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);

    // add some noise pattern
    const imageData = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < imageData.data.length; i += 4) {
      const noise = Math.random() * 30 - 15;
      imageData.data[i] = Math.max(0, Math.min(255, 128 + noise));
      imageData.data[i + 1] = Math.max(0, Math.min(255, 128 + noise));
      imageData.data[i + 2] = 128;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    const displacementTexture = Texture.from(canvas);
    this.displacementSprite = new Sprite({ texture: displacementTexture });
    // don't add to display list — it's only used by the filter

    // create the displacement filter — scale controls distortion intensity
    const scale = webcamConfig.mask.displacementScale ?? 15;
    this.displacementFilter = new DisplacementFilter({
      sprite: this.displacementSprite!,
      scale,
    });

    if (this.sprite) {
      const existingFilters = this.sprite.filters ?? [];
      this.sprite.filters = [...existingFilters, this.displacementFilter];
    }
  }

  public update(ticker: Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.idleTime += dt;

    if (!this.sprite || !this.sprite.texture) return;

    // animate displacement texture for fluid border effect
    if (this.displacementSprite && this.displacementFilter) {
      const size = 256;
      const canvas = this.displacementSprite.texture.source.resource as
        HTMLCanvasElement | undefined;
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        // generate animated noise using sine waves for smooth organic motion
        const imageData = ctx.getImageData(0, 0, size, size);
        const t = this.idleTime * 0.5;

        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            // multi-frequency sine noise for organic feel
            const n1 = Math.sin(x * 0.05 + t) * Math.cos(y * 0.05 + t * 0.7);
            const n2 = Math.sin((x + y) * 0.03 + t * 1.3) * 0.5;
            const n3 =
              Math.sin(x * 0.02 - t * 0.5) * Math.cos(y * 0.02 + t * 0.8) * 0.3;
            const noise = (n1 + n2 + n3) * 40;

            imageData.data[i] = Math.max(0, Math.min(255, 128 + noise));
            imageData.data[i + 1] = Math.max(0, Math.min(255, 128 + noise));
            imageData.data[i + 2] = 128;
            imageData.data[i + 3] = 255;
          }
        }
        ctx.putImageData(imageData, 0, 0);

        // mark texture as dirty so PixiJS re-renders it
        this.displacementSprite!.texture.source.update();
      }
    }

    const maskCfg = webcamConfig.mask;

    // organic breathing scale — multi-frequency sine waves
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
