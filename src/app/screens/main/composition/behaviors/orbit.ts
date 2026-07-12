import type { Behavior, BehaviorContext } from "./types";

export class OrbitBehavior implements Behavior {
  private centerX: number;
  private centerY: number;
  private radius: number;
  private speed: number;
  private angle: number;

  constructor(bounds: { width: number; height: number }) {
    this.centerX = bounds.width * 0.5;
    this.centerY = bounds.height * 0.5;
    this.radius = 100 + Math.random() * 300;
    this.speed = 0.2 + Math.random() * 0.8;
    this.angle = Math.random() * Math.PI * 2;
  }

  update({ asset, ticker }: BehaviorContext) {
    this.angle += ticker.deltaMS * 0.001 * this.speed;
    asset.x = this.centerX + Math.cos(this.angle) * this.radius;
    asset.y = this.centerY + Math.sin(this.angle) * this.radius;
  }
}
