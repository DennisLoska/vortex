import type { Ticker } from "pixi.js";
import { Container, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { webcamConfig, webcamPresets } from "./composition.config";
import { WebcamBlobMask } from "./WebcamBlobMask";

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
  private userPlaced = false;
  private animationPaused = false;
  private blobMask!: WebcamBlobMask;

  public toggleAnimation() {
    this.animationPaused = !this.animationPaused;
  }

  constructor() {
    super();
    this.setupDrag();
  }

  private setupDrag() {
    this.eventMode = "static";
    this.cursor = "grab";
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    this.on("pointerdown", (e) => {
      dragging = true;
      this.cursor = "grabbing";
      this.userPlaced = true;
      const parent = this.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      dragOffset = { x: this.x - pos.x, y: this.y - pos.y };
    });

    this.on("globalpointermove", (e) => {
      if (!dragging) return;
      const parent = this.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      this.x = pos.x + dragOffset.x;
      this.y = pos.y + dragOffset.y;
    });

    const stopDrag = () => {
      dragging = false;
      this.cursor = "grab";
    };
    this.on("pointerup", stopDrag);
    this.on("pointerupoutside", stopDrag);
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

      this.blobMask = new WebcamBlobMask(
        webcamConfig.mask.blob,
        webcamConfig.mask.width,
        webcamConfig.mask.height,
      );
      this.addChild(this.blobMask);
      this.setMask({ mask: this.blobMask, channel: "alpha" });

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
    this.userPlaced = false;
    const next = (this.currentPresetIndex + 1) % webcamPresets.length;
    this.applyPreset(next);
  }

  public setPreset(index: number) {
    this.userPlaced = false;
    const clamped = Math.max(0, Math.min(index, webcamPresets.length - 1));
    this.applyPreset(clamped);
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
    this.syncMaskRadius();
  }

  private syncMaskRadius() {
    if (!this.sprite || !this.blobMask) return;
    const w = this.sprite.width;
    const h = this.sprite.height;
    this.blobMask.setSize(w, h);
    this.blobMask.setRadii(
      w * webcamConfig.mask.blob.clip,
      h * webcamConfig.mask.blob.clip,
    );
  }

  public update(ticker: Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.idleTime += dt;

    if (!this.sprite || !this.sprite.texture) return;

    this.blobMask.update(dt);

    if (this.animationPaused) return;

    // auto-jump timer — disabled after manual drag
    if (!this.userPlaced) {
      this.autoJumpTimer += dt;
      if (this.autoJumpTimer >= this.nextAutoJump) {
        this.autoJumpTimer = 0;
        this.nextAutoJump = randomFloat(
          webcamConfig.autoJumpInterval.min,
          webcamConfig.autoJumpInterval.max,
        );
      }
    }
  }
}
