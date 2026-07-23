import { Graphics } from "pixi.js";

export interface BlobMaskConfig {
  segments: number;
  morphSpeed: number;
  wobble: number;
  phaseSpread: number;
  subdivisions: number;
}

export class WebcamBlobMask extends Graphics {
  private elapsed = 0;
  private config: BlobMaskConfig;
  private radius = 200;

  constructor(config: BlobMaskConfig) {
    super();
    this.config = config;
  }

  public update(dt: number) {
    this.elapsed += dt;
    this.clear();

    const { segments, morphSpeed, wobble, phaseSpread, subdivisions } =
      this.config;
    const ctrl: number[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
      const r =
        this.radius +
        Math.sin(this.elapsed * morphSpeed + i * phaseSpread) * wobble +
        Math.sin(this.elapsed * morphSpeed * 0.6 + i * phaseSpread * 1.7) *
          (wobble * 0.5) +
        Math.sin(this.elapsed * morphSpeed * 0.3 + i * phaseSpread * 0.4) *
          (wobble * 0.3);
      ctrl.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }

    const verts: number[] = [];
    const n = segments;

    for (let i = 0; i < n; i++) {
      const i0 = ((i - 1 + n) % n) * 2;
      const i1 = i * 2;
      const i2 = ((i + 1) % n) * 2;
      const i3 = ((i + 2) % n) * 2;

      for (let j = 0; j < subdivisions; j++) {
        const t = j / subdivisions;
        verts.push(
          this.catmullRom(ctrl[i0], ctrl[i1], ctrl[i2], ctrl[i3], t),
          this.catmullRom(
            ctrl[i0 + 1],
            ctrl[i1 + 1],
            ctrl[i2 + 1],
            ctrl[i3 + 1],
            t,
          ),
        );
      }
    }

    this.poly(verts).fill(0xffffff);
  }

  public setRadius(r: number) {
    this.radius = r;
  }

  private catmullRom(
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    t: number,
  ): number {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  }
}
