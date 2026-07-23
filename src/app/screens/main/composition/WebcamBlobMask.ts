import { Sprite, Texture, CanvasSource } from "pixi.js";

export interface BlobMaskConfig {
  segments: number;
  morphSpeed: number;
  wobble: number;
  phaseSpread: number;
  subdivisions: number;
  feather: number;
}

export class WebcamBlobMask extends Sprite {
  private elapsed = 0;
  private config: BlobMaskConfig;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private radiusX = 240;
  private radiusY = 180;

  constructor(config: BlobMaskConfig, width: number, height: number) {
    const pad = config.feather + config.wobble * 1.5;
    const cw = Math.ceil(width + pad * 2);
    const ch = Math.ceil(height + pad * 2);
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    const source = new CanvasSource({ resource: canvas });
    const texture = new Texture({ source });
    super({ texture, anchor: 0.5 });
    this.canvas = canvas;
    this.ctx = ctx;
    this.config = config;
    this.width = width;
    this.height = height;
  }

  public setRadii(rx: number, ry: number) {
    this.radiusX = rx;
    this.radiusY = ry;
  }

  public setSize(w: number, h: number) {
    const pad = this.config.feather + this.config.wobble * 1.5;
    const cw = Math.ceil(w + pad * 2);
    const ch = Math.ceil(h + pad * 2);
    this.width = w;
    this.height = h;

    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.texture.source.resize(cw, ch);
    }
  }

  public update(dt: number) {
    this.elapsed += dt;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const { segments, morphSpeed, wobble, phaseSpread, subdivisions, feather } =
      this.config;
    const ctrl: number[] = [];
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
      const wobbleT =
        Math.sin(this.elapsed * morphSpeed + i * phaseSpread) * wobble +
        Math.sin(this.elapsed * morphSpeed * 0.6 + i * phaseSpread * 1.7) *
          (wobble * 0.5) +
        Math.sin(this.elapsed * morphSpeed * 0.3 + i * phaseSpread * 0.4) *
          (wobble * 0.3);
      ctrl.push(
        cx + Math.cos(angle) * (this.radiusX + wobbleT),
        cy + Math.sin(angle) * (this.radiusY + wobbleT),
      );
    }

    const n = segments;
    const verts: number[] = [];

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

    this.ctx.filter = `blur(${feather}px)`;
    this.ctx.fillStyle = "white";
    this.ctx.beginPath();
    this.ctx.moveTo(verts[0], verts[1]);
    for (let i = 2; i < verts.length; i += 2) {
      this.ctx.lineTo(verts[i], verts[i + 1]);
    }
    this.ctx.closePath();
    this.ctx.fill();

    this.texture.source.update();
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
