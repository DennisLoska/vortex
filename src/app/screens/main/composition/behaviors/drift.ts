import type { Behavior, BehaviorContext } from "./types";

export class DriftBehavior implements Behavior {
  private vx: number;
  private vy: number;
  private rotationSpeed: number;

  constructor() {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
  }

  update({ asset }: BehaviorContext) {
    asset.x += this.vx;
    asset.y += this.vy;
    asset.rotation += this.rotationSpeed;
  }
}
