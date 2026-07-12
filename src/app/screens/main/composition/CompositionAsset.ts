import type { Container, Ticker } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { animationProfiles, type AnimationProfile } from "./composition.config";

export class CompositionAsset {
  public view: Container;
  private profile: AnimationProfile;
  private lifetime: number;
  private age = 0;
  private fadeDuration: number;
  private disposed = false;
  private startX: number;
  private startY: number;
  private startScale: number;
  private startRotation: number;
  private driftAngle: number;
  private driftSpeed: number;
  private scalePhase: number;
  private rotationPhase: number;

  constructor(
    view: Container,
    bounds: { width: number; height: number },
    profile: AnimationProfile,
    startX?: number,
    startY?: number,
  ) {
    this.view = view;
    this.profile = profile;

    const config = animationProfiles[profile];
    this.lifetime = randomFloat(config.lifetime.min, config.lifetime.max);
    this.fadeDuration = config.fadeDuration;

    const pad = 350;
    this.startX = startX ?? randomFloat(pad, Math.max(pad, bounds.width - pad));
    this.startY =
      startY ?? randomFloat(pad, Math.max(pad, bounds.height - pad));
    this.startScale = 0.25 + Math.random() * 0.5;
    this.startRotation =
      (Math.random() - 0.5) * 2 * (config.rotationRange * (Math.PI / 180));
    this.driftAngle = Math.random() * Math.PI * 2;
    this.driftSpeed = randomFloat(config.driftSpeed.min, config.driftSpeed.max);
    this.scalePhase = Math.random() * Math.PI * 2;
    this.rotationPhase = Math.random() * Math.PI * 2;

    view.x = this.startX;
    view.y = this.startY;
    view.scale.set(this.startScale);
    view.rotation = this.startRotation;
    view.alpha = 0;
  }

  public update(
    ticker: Ticker,
    bounds: { width: number; height: number },
    globalTime: number,
  ) {
    if (this.disposed) return;

    const dt = ticker.deltaMS / 1000;
    this.age += dt;

    const config = animationProfiles[this.profile];

    if (config.driftSpeed.max > 0) {
      const driftX = Math.cos(this.driftAngle) * this.driftSpeed * this.age;
      const driftY = Math.sin(this.driftAngle) * this.driftSpeed * this.age;
      this.view.x = Math.max(
        50,
        Math.min(bounds.width - 50, this.startX + driftX),
      );
      this.view.y = Math.max(
        50,
        Math.min(bounds.height - 50, this.startY + driftY),
      );
    }

    if (config.scalePulse.max !== config.scalePulse.min) {
      const pulse = Math.sin(globalTime * 0.8 + this.scalePhase);
      const range = (config.scalePulse.max - config.scalePulse.min) / 2;
      const mid = (config.scalePulse.max + config.scalePulse.min) / 2;
      this.view.scale.set(this.startScale * (mid + pulse * range));
    }

    if (config.rotationRange > 0) {
      const wobble = Math.sin(globalTime * 0.5 + this.rotationPhase);
      const rotationRad = wobble * config.rotationRange * (Math.PI / 180);
      this.view.rotation = this.startRotation + rotationRad;
    }

    if (this.age < this.fadeDuration) {
      this.view.alpha = this.age / this.fadeDuration;
    } else if (this.age > this.lifetime - this.fadeDuration) {
      this.view.alpha = Math.max(
        0,
        (this.lifetime - this.age) / this.fadeDuration,
      );
    } else {
      this.view.alpha = 1;
    }

    if (this.age >= this.lifetime) {
      this.dispose();
    }
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }

  public get isDead() {
    return this.disposed;
  }
}
