import type { Container, Ticker } from "pixi.js";

export interface BehaviorContext {
  asset: Container;
  bounds: { width: number; height: number };
  ticker: Ticker;
}

export interface Behavior {
  update(ctx: BehaviorContext): void;
  dispose?(): void;
}
