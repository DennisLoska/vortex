import type { Behavior, BehaviorContext } from "./types";

export class FloatBehavior implements Behavior {
  private time = 0;
  private speedX: number;
  private speedY: number;
  private amplitudeX: number;
  private amplitudeY: number;

  constructor() {
    this.speedX = 0.5 + Math.random() * 1.5;
    this.speedY = 0.5 + Math.random() * 1.5;
    this.amplitudeX = 20 + Math.random() * 40;
    this.amplitudeY = 20 + Math.random() * 40;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.time += ticker.deltaMS * 0.001;
    asset.x += Math.sin(this.time * this.speedX) * this.amplitudeX * 0.01;
    asset.y += Math.cos(this.time * this.speedY) * this.amplitudeY * 0.01;
  }
}
