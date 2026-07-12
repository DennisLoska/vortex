import type { Ticker } from "pixi.js";
import { Container, Filter, Sprite, Texture, VideoSource } from "pixi.js";

import { randomFloat } from "../../../../engine/utils/random";
import { webcamConfig, webcamPresets } from "./composition.config";

// Custom fragment shader: fluid displacement + radial alpha dissolve
const vertexShader = `
    in vec2 aPosition;
    out vec2 vTextureCoord;
    uniform vec4 uInputSize;
    uniform vec4 uOutputFrame;

    void main() {
        vTextureCoord = filterTextureCoord(aPosition, uInputSize, uOutputFrame);
        finalColor = texture(uTexture, vTextureCoord);
    }
`;

const fragmentShader = `
    in vec2 vTextureCoord;
    out vec4 finalColor;
    uniform sampler2D uTexture;
    uniform float uTime;
    uniform float uDisplacementScale;
    uniform vec2 uResolution;

    // simplex-ish 2D noise
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

    float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                            0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                           -0.577350269189626,  // -1.0 + 2.0 * C.x
                            0.024390243902439); // 1.0 / 41.0
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
            + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m ;
        m = m*m ;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
    }

    void main() {
        vec2 uv = vTextureCoord;
        float aspect = uResolution.x / uResolution.y;

        // --- fluid displacement via noise ---
        float n1 = snoise(vec2(uv.x * 3.0 + uTime * 0.4, uv.y * 3.0 + uTime * 0.3));
        float n2 = snoise(vec2(uv.x * 5.0 - uTime * 0.6, uv.y * 5.0 - uTime * 0.2));
        vec2 displacement = vec2(n1, n2) * (uDisplacementScale / max(uResolution.x, uResolution.y)) * 2.0;

        // --- radial alpha dissolve from center to edges ---
        vec2 center = uv - 0.5;
        float dist = length(center);
        float edgeFade = 0.18; // how far from center the fade starts (normalized)
        float alpha = 1.0 - smoothstep(1.0 - edgeFade, 1.0 + edgeFade * 0.3, dist);

        // sample displaced UV for color
        vec2 displacedUV = uv + displacement;
        finalColor = texture(uTexture, displacedUV);
        finalColor.a *= alpha;
    }
`;

export class WebcamAsset extends Container {
  private videoElement: HTMLVideoElement | undefined;
  private sprite: Sprite | undefined;
  private currentPresetIndex = 0;
  private bounds = { width: 1920, height: 1080 };
  private autoJumpTimer = 0;
  private nextAutoJump = randomFloat(
    webcamConfig.autoJumpInterval.min,
    webcamConfig.autoJumpInterval.max,
  );
  private idleTime = 0;

  // custom filter combining displacement + alpha dissolve
  private dissolveFilter: Filter | null = null;

  constructor() {
    super();
  }

  public async init() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.videoElement = document.createElement("video");
      this.videoElement.srcObject = stream;
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      await this.videoElement.play();

      const source = new VideoSource({ resource: this.videoElement });
      const texture = new Texture({ source });
      this.sprite = new Sprite({ texture, anchor: 0.5 });
      this.addChild(this.sprite);
      this.applyPreset(0);
      this.buildDissolveFilter();
    } catch (error) {
      console.warn("Webcam access denied or unavailable:", error);
    }
  }

  public stop() {
    if (this.videoElement?.srcObject) {
      const tracks = (this.videoElement.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
    }
    this.videoElement = undefined;
    this.sprite?.destroy();
    this.sprite = undefined;
  }

  public resize(bounds: { width: number; height: number }) {
    this.bounds = bounds;
    if (this.sprite) {
      const preset = webcamPresets[this.currentPresetIndex];
      const w = webcamConfig.mask.width * preset.scale;
      const h = webcamConfig.mask.height * preset.scale;
      this.sprite.width = w;
      this.sprite.height = h;
    }
    this.applyPreset(this.currentPresetIndex);
  }

  public nextPreset() {
    const next = (this.currentPresetIndex + 1) % webcamPresets.length;
    this.applyPreset(next);
  }

  public jumpToRandomPreset() {
    let next = this.currentPresetIndex;
    while (next === this.currentPresetIndex) {
      next = Math.floor(Math.random() * webcamPresets.length);
    }
    this.applyPreset(next);
  }

  private applyPreset(index: number) {
    this.currentPresetIndex = index;
    const preset = webcamPresets[index];
    const w = webcamConfig.mask.width * preset.scale;
    const h = webcamConfig.mask.height * preset.scale;
    this.x = this.bounds.width * preset.x;
    this.y = this.bounds.height * preset.y;

    if (this.sprite) {
      this.sprite.width = w;
      this.sprite.height = h;
    }
  }

  private buildDissolveFilter() {
    // destroy old filter
    if (this.dissolveFilter) {
      if (this.sprite && this.sprite.filters) {
        const filters = [...this.sprite.filters];
        const idx = filters.indexOf(this.dissolveFilter);
        if (idx !== -1) {
          filters.splice(idx, 1);
          this.sprite.filters = filters;
        }
      }
      this.dissolveFilter.destroy();
      this.dissolveFilter = null;
    }

    const scale = webcamConfig.mask.displacementScale ?? 15;

    this.dissolveFilter = Filter.from({
      gl: { vertex: vertexShader, fragment: fragmentShader },
      resources: {
        dissolveUniforms: {
          uTime: { value: 0, type: "f32" },
          uDisplacementScale: { value: scale, type: "f32" },
          uResolution: {
            value: new Float32Array([this.bounds.width, this.bounds.height]),
            type: "vec2<f32>",
          },
        },
      },
    });

    if (this.sprite) {
      const existingFilters = this.sprite.filters ?? [];
      this.sprite.filters = [...existingFilters, this.dissolveFilter];
    }
  }

  public update(ticker: Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.idleTime += dt;

    if (!this.sprite || !this.sprite.texture) return;

    // update filter uniforms each frame
    if (this.dissolveFilter) {
      this.dissolveFilter.resources.dissolveUniforms.uniforms.uTime =
        this.idleTime;
    }

    const maskCfg = webcamConfig.mask;

    // organic breathing scale — multi-frequency sine waves
    const breathe = Math.sin(this.idleTime * 0.6);
    const breathe2 = Math.sin(this.idleTime * 0.4 + 1.3);
    const breathe3 = Math.sin(this.idleTime * 0.25 + 2.7);

    // subtle scale pulse — never resets to flat
    const scaleRange =
      (maskCfg.idleScalePulse.max - maskCfg.idleScalePulse.min) / 2;
    const scaleMid =
      (maskCfg.idleScalePulse.max + maskCfg.idleScalePulse.min) / 2;
    const combinedBreath = breathe * 0.5 + breathe2 * 0.3 + breathe3 * 0.2;
    this.scale.set(scaleMid + combinedBreath * scaleRange);

    // gentle rotation — multi-frequency for organic feel
    const rot1 = Math.sin(this.idleTime * 0.7) * maskCfg.idleRotationRange;
    const rot2 =
      Math.sin(this.idleTime * 0.35 + 1.8) * (maskCfg.idleRotationRange * 0.4);
    this.rotation = ((rot1 + rot2) / 180) * Math.PI;

    // auto-jump timer
    this.autoJumpTimer += dt;
    if (this.autoJumpTimer >= this.nextAutoJump) {
      this.jumpToRandomPreset();
      this.autoJumpTimer = 0;
      this.nextAutoJump = randomFloat(
        webcamConfig.autoJumpInterval.min,
        webcamConfig.autoJumpInterval.max,
      );
    }
  }
}
