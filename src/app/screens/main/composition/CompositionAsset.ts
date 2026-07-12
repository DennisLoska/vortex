import { animate } from "motion";
import type { Container, Ticker } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { compositionConfig } from "./composition.config";
import { DriftBehavior } from "./behaviors/drift";
import { FloatBehavior } from "./behaviors/float";
import { OrbitBehavior } from "./behaviors/orbit";
import { PulseBehavior } from "./behaviors/pulse";
import type { Behavior } from "./behaviors/types";

export class CompositionAsset {
  public view: Container;
  private behavior: Behavior;
  private lifetime: number;
  private age = 0;
  private disposed = false;
  private fadingOut = false;

  constructor(view: Container, bounds: { width: number; height: number }) {
    this.view = view;
    this.view.position.set(
      randomFloat(0, bounds.width),
      randomFloat(0, bounds.height),
    );
    this.view.alpha = 0;
    this.lifetime =
      randomFloat(
        compositionConfig.assetLifetime.min,
        compositionConfig.assetLifetime.max,
      ) * 1000;

    const behaviorKey = this.pickBehavior();
    switch (behaviorKey) {
      case "float":
        this.behavior = new FloatBehavior();
        break;
      case "drift":
        this.behavior = new DriftBehavior();
        break;
      case "orbit":
        this.behavior = new OrbitBehavior(bounds);
        break;
      case "pulse":
        this.behavior = new PulseBehavior();
        break;
      default:
        this.behavior = new FloatBehavior();
    }

    animate(this.view, { alpha: 1 }, { duration: 0.4 });
  }

  public update(ticker: Ticker, bounds: { width: number; height: number }) {
    if (this.disposed) return;
    this.age += ticker.deltaMS;
    this.behavior.update({ asset: this.view, bounds, ticker });

    if (this.age >= this.lifetime - 1000 && !this.fadingOut) {
      this.fadingOut = true;
      animate(this.view, { alpha: 0 }, { duration: 0.5 });
    }

    if (this.age >= this.lifetime) {
      this.dispose();
    }
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.behavior.dispose?.();
    this.view.destroy({ children: true });
  }

  public get isDead() {
    return this.disposed;
  }

  private pickBehavior(): "float" | "drift" | "orbit" | "pulse" {
    const weights = compositionConfig.behaviorWeights;
    const total = weights.float + weights.drift + weights.orbit + weights.pulse;
    const roll = Math.random() * total;
    let cumulative = 0;

    cumulative += weights.float;
    if (roll < cumulative) return "float";
    cumulative += weights.drift;
    if (roll < cumulative) return "drift";
    cumulative += weights.orbit;
    if (roll < cumulative) return "orbit";
    return "pulse";
  }
}
