import { animate } from "motion";
import type { ObjectTarget } from "motion/react";
import { Container, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { waitFor } from "../../../../engine/utils/waitFor";
import { compositionConfig } from "./composition.config";

export class WebcamAsset extends Container {
  private videoElement: HTMLVideoElement | undefined;
  private sprite: Sprite | undefined;
  private currentCornerIndex = 0;
  private running = false;

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
      this.running = true;
      this.jumpLoop();
    } catch (error) {
      console.warn("Webcam access denied or unavailable:", error);
    }
  }

  public stop() {
    this.running = false;
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    this.videoElement = undefined;
    this.sprite?.destroy();
    this.sprite = undefined;
  }

  public resize(bounds: { width: number; height: number }) {
    if (!this.sprite) return;
    const targetWidth = bounds.width * compositionConfig.webcam.scale;
    const scale = targetWidth / this.sprite.texture.width;
    this.sprite.scale.set(scale);
    this.moveToCorner(bounds, this.currentCornerIndex);
  }

  private async jumpLoop() {
    while (this.running) {
      await waitFor(
        randomFloat(
          compositionConfig.webcam.jumpInterval.min,
          compositionConfig.webcam.jumpInterval.max,
        ),
      );
      if (!this.running) break;

      const corners = compositionConfig.webcam.corners.length;
      let next = this.currentCornerIndex;
      while (next === this.currentCornerIndex) {
        next = Math.floor(Math.random() * corners);
      }
      this.currentCornerIndex = next;
      this.moveToCorner(
        {
          width: this.parent?.width ?? 1920,
          height: this.parent?.height ?? 1080,
        },
        this.currentCornerIndex,
        true,
      );
    }
  }

  private moveToCorner(
    bounds: { width: number; height: number },
    cornerIndex: number,
    animateMove = false,
  ) {
    if (!this.sprite) return;
    const margin = compositionConfig.webcam.margin;
    const w = this.sprite.width;
    const h = this.sprite.height;

    let x = margin + w * 0.5;
    let y = margin + h * 0.5;

    const corner = compositionConfig.webcam.corners[cornerIndex];
    if (corner === "top-right" || corner === "bottom-right")
      x = bounds.width - margin - w * 0.5;
    if (corner === "bottom-left" || corner === "bottom-right")
      y = bounds.height - margin - h * 0.5;

    if (animateMove) {
      animate(this, { x, y } as ObjectTarget<this>, {
        duration: 0.8,
        ease: "backOut",
      });
    } else {
      this.position.set(x, y);
    }
  }
}
