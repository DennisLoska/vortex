import type { Behavior, BehaviorContext } from "./types";

export class PulseBehavior implements Behavior {
  private time = 0;
  private speed: number;
  private baseScale: number;

  constructor() {
    this.speed = 1 + Math.random() * 2;
    this.baseScale = 0.5 + Math.random() * 0.5;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.time += ticker.deltaMS * 0.001;
    const scale = this.baseScale + Math.sin(this.time * this.speed) * 0.15;
    asset.scale.set(scale);
    asset.alpha = 0.6 + Math.abs(Math.sin(this.time * this.speed)) * 0.4;
  }
}
