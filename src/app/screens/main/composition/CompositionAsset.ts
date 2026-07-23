import type { Container, Ticker } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import {
  animationProfiles,
  GRID_PADDING,
  type AnimationProfile,
} from "./composition.config";

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

  private onDispose?: () => void;

  constructor(
    view: Container,
    bounds: { width: number; height: number },
    profile: AnimationProfile,
    startX?: number,
    startY?: number,
    onDispose?: () => void,
  ) {
    this.onDispose = onDispose;
    this.view = view;
    this.profile = profile;

    const config = animationProfiles[profile];
    this.lifetime = randomFloat(config.lifetime.min, config.lifetime.max);
    this.fadeDuration = config.fadeDuration;

    this.startX =
      startX ??
      randomFloat(
        GRID_PADDING,
        Math.max(GRID_PADDING, bounds.width - GRID_PADDING),
      );
    this.startY =
      startY ??
      randomFloat(
        GRID_PADDING,
        Math.max(GRID_PADDING, bounds.height - GRID_PADDING),
      );
    this.startScale = 0.5 + Math.random() * 0.5;
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
    view.alpha = this.fadeDuration === 0 ? 1 : 0;
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
      if (this.dying) {
        this.view.x = this.frozenX;
        this.view.y = this.frozenY;
      } else {
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
    }

    if (config.scalePulse.max !== config.scalePulse.min && !this.dying) {
      const pulse = Math.sin(globalTime * 0.8 + this.scalePhase);
      const range = (config.scalePulse.max - config.scalePulse.min) / 2;
      const mid = (config.scalePulse.max + config.scalePulse.min) / 2;
      this.view.scale.set(this.startScale * (mid + pulse * range));
    }

    if (config.rotationRange > 0 && !this.dying) {
      const wobble = Math.sin(globalTime * 0.5 + this.rotationPhase);
      const rotationRad = wobble * config.rotationRange * (Math.PI / 180);
      this.view.rotation = this.startRotation + rotationRad;
    }

    if (this.fadeDuration === 0) {
      // pop — instant, no fade
    } else if (this.age < this.fadeDuration) {
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

  private dying = false;
  private frozenX = 0;
  private frozenY = 0;

  public startDying() {
    this.dying = true;
    this.frozenX = this.view.x;
    this.frozenY = this.view.y;
    this.age = Math.max(this.age, this.lifetime - this.fadeDuration);
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.onDispose?.();
    this.view.removeFromParent();
    this.view.destroy({ children: true });
  }

  public get isDead() {
    return this.disposed;
  }
}
