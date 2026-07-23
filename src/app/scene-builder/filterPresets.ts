import {
  AlphaFilter,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
  type Filter,
} from "pixi.js";

import { GlowFilter } from "pixi-filters/glow";
import { DropShadowFilter } from "pixi-filters/drop-shadow";
import { OutlineFilter } from "pixi-filters/outline";
import { PixelateFilter } from "pixi-filters/pixelate";
import { RGBSplitFilter } from "pixi-filters/rgb-split";
import { CRTFilter } from "pixi-filters/crt";
import { EmbossFilter } from "pixi-filters/emboss";
import { MotionBlurFilter } from "pixi-filters/motion-blur";
import { GodrayFilter } from "pixi-filters/godray";
import { BevelFilter } from "pixi-filters/bevel";
import { CrossHatchFilter } from "pixi-filters/cross-hatch";
import { OldFilmFilter } from "pixi-filters/old-film";
import { BloomFilter } from "pixi-filters/bloom";
import { AsciiFilter } from "pixi-filters/ascii";
import { GlitchFilter } from "pixi-filters/glitch";
import { ReflectionFilter } from "pixi-filters/reflection";
import { AdjustmentFilter } from "pixi-filters/adjustment";
import { TiltShiftFilter } from "pixi-filters/tilt-shift";
import { ZoomBlurFilter } from "pixi-filters/zoom-blur";

export interface FilterPreset {
  name: string;
  create: () => Filter | null;
  icon: string;
  adjustIntensity?: (filter: Filter, pct: number) => void;
}

export function getFilterPreset(name: string): FilterPreset | undefined {
  return FILTER_PRESETS.find((p) => p.name === name);
}

export const FILTER_PRESETS: FilterPreset[] = [
  { name: "None", icon: "X", create: () => null },

  // -- ColorMatrix effects --
  {
    name: "Grayscale",
    icon: "O",
    create: () => {
      const f = new ColorMatrixFilter();
      f.greyscale(1, false);
      return f;
    },
  },
  {
    name: "Sepia",
    icon: "S",
    create: () => {
      const f = new ColorMatrixFilter();
      f.sepia(false);
      return f;
    },
  },
  {
    name: "Vintage",
    icon: "V",
    create: () => {
      const f = new ColorMatrixFilter();
      f.vintage(false);
      return f;
    },
  },
  {
    name: "Kodachrome",
    icon: "K",
    create: () => {
      const f = new ColorMatrixFilter();
      f.kodachrome(false);
      return f;
    },
  },
  {
    name: "Polaroid",
    icon: "P",
    create: () => {
      const f = new ColorMatrixFilter();
      f.polaroid(false);
      return f;
    },
  },
  {
    name: "Negative",
    icon: "N",
    create: () => {
      const f = new ColorMatrixFilter();
      f.negative(false);
      return f;
    },
  },
  {
    name: "Technicolor",
    icon: "T",
    create: () => {
      const f = new ColorMatrixFilter();
      f.technicolor(false);
      return f;
    },
  },
  {
    name: "Predator",
    icon: "Pr",
    create: () => {
      const f = new ColorMatrixFilter();
      f.predator(0.5, false);
      return f;
    },
  },
  {
    name: "LSD",
    icon: "L",
    create: () => {
      const f = new ColorMatrixFilter();
      f.lsd(false);
      return f;
    },
  },

  // -- Built-in filters --
  {
    name: "Bright",
    icon: "B",
    create: () => {
      const f = new ColorMatrixFilter();
      f.brightness(1.5, false);
      return f;
    },
  },
  {
    name: "Contrast",
    icon: "C",
    create: () => {
      const f = new ColorMatrixFilter();
      f.contrast(0.5, true);
      return f;
    },
  },
  {
    name: "Night",
    icon: "Ni",
    create: () => {
      const f = new ColorMatrixFilter();
      f.night(0.5, false);
      return f;
    },
  },
  {
    name: "Blur Light",
    icon: "b",
    create: () => new BlurFilter({ strength: 2, quality: 3 }),
  },
  {
    name: "Blur Heavy",
    icon: "B",
    create: () => new BlurFilter({ strength: 8, quality: 5 }),
  },
  {
    name: "Noise Light",
    icon: "n",
    create: () => new NoiseFilter({ noise: 0.15, seed: Math.random() }),
  },
  {
    name: "Noise Heavy",
    icon: "N",
    create: () => new NoiseFilter({ noise: 0.5, seed: Math.random() }),
  },
  {
    name: "Alpha 50%",
    icon: "A",
    create: () => new AlphaFilter({ alpha: 0.5 }),
  },

  // -- Community filters (pixi-filters) --
  {
    name: "Glow",
    icon: "G",
    create: () => new GlowFilter({ distance: 15, outerStrength: 2 }),
    adjustIntensity: (f, t) => {
      (f as GlowFilter).outerStrength = t * 8;
    },
  },
  {
    name: "Bloom",
    icon: "Bl",
    create: () => new BloomFilter({ strength: 3, quality: 4 }),
    adjustIntensity: (f, t) => {
      (f as BloomFilter).strength = { x: t * 8, y: t * 8 };
    },
  },
  {
    name: "Drop Shadow",
    icon: "D",
    create: () =>
      new DropShadowFilter({
        blur: 4,
        quality: 3,
        alpha: 0.5,
        offset: { x: 5, y: 5 },
      }),
    adjustIntensity: (f, t) => {
      (f as DropShadowFilter).blur = t * 10;
    },
  },
  {
    name: "Outline",
    icon: "O",
    create: () => new OutlineFilter({ thickness: 2, color: 0x000000 }),
    adjustIntensity: (f, t) => {
      (f as OutlineFilter).thickness = t * 6;
    },
  },
  {
    name: "Pixelate",
    icon: "Px",
    create: () => new PixelateFilter(8),
    adjustIntensity: (f, t) => {
      const s = Math.max(1, Math.round(t * 30));
      (f as PixelateFilter).size = s;
    },
  },
  {
    name: "RGB Split",
    icon: "R",
    create: () =>
      new RGBSplitFilter({
        red: { x: -10, y: 0 },
        green: { x: 0, y: 0 },
        blue: { x: 10, y: 0 },
      }),
    adjustIntensity: (f, t) => {
      const o = Math.round(t * 40);
      (f as RGBSplitFilter).red = { x: -o, y: 0 };
      (f as RGBSplitFilter).blue = { x: o, y: 0 };
    },
  },
  {
    name: "CRT",
    icon: "C",
    create: () =>
      new CRTFilter({
        curvature: 1,
        lineWidth: 2,
        lineContrast: 0.3,
        noise: 0.1,
      }),
    adjustIntensity: (f, t) => {
      (f as CRTFilter).noise = t;
    },
  },
  {
    name: "Emboss",
    icon: "E",
    create: () => new EmbossFilter(5),
    adjustIntensity: (f, t) => {
      (f as EmbossFilter).strength = t * 20;
    },
  },
  {
    name: "Motion Blur",
    icon: "M",
    create: () =>
      new MotionBlurFilter({ kernelSize: 9, velocity: { x: 5, y: 0 } }),
    adjustIntensity: (f, t) => {
      (f as MotionBlurFilter).velocity = { x: t * 30, y: 0 };
    },
  },
  {
    name: "Glitch",
    icon: "Gl",
    create: () =>
      new GlitchFilter({ slices: 10, offset: 20, direction: 0, fillMode: 0 }),
    adjustIntensity: (f, t) => {
      (f as GlitchFilter).offset = t * 60;
    },
  },
  {
    name: "Godray",
    icon: "Go",
    create: () =>
      new GodrayFilter({ angle: 0.5, gain: 0.5, lacunarity: 2.5, time: 0 }),
    adjustIntensity: (f, t) => {
      (f as GodrayFilter).gain = t;
    },
  },
  {
    name: "Bevel",
    icon: "Bv",
    create: () =>
      new BevelFilter({
        thickness: 3,
        rotation: 45,
        lightColor: 0xffffff,
        lightAlpha: 0.5,
        shadowColor: 0x000000,
        shadowAlpha: 0.5,
      }),
    adjustIntensity: (f, t) => {
      (f as BevelFilter).thickness = Math.max(0.1, t * 8);
    },
  },
  {
    name: "Cross Hatch",
    icon: "X",
    create: () => new CrossHatchFilter(),
    adjustIntensity: () => {},
  },
  {
    name: "Old Film",
    icon: "OF",
    create: () =>
      new OldFilmFilter({
        sepia: 0.3,
        noise: 0.3,
        scratch: 0.5,
        noiseSize: 1,
        vignetting: 0.3,
      }),
    adjustIntensity: (f, t) => {
      (f as OldFilmFilter).noise = t;
      (f as OldFilmFilter).vignetting = t;
    },
  },
  {
    name: "ASCII",
    icon: "A",
    create: () => new AsciiFilter({ size: 8 }),
    adjustIntensity: (f, t) => {
      (f as AsciiFilter).size = Math.max(2, Math.round(t * 30));
    },
  },
  {
    name: "Reflection",
    icon: "Rf",
    create: () =>
      new ReflectionFilter({
        mirror: true,
        boundary: 0.5,
        amplitude: [0, 20],
        waveLength: [30, 100],
        alpha: [1, 1],
        time: 0,
      }),
    adjustIntensity: (f, t) => {
      (f as ReflectionFilter).amplitude = [0, Math.round(t * 40)];
    },
  },
  {
    name: "Tilt Shift",
    icon: "TS",
    create: () => new TiltShiftFilter({ blur: 3, gradientBlur: 3 }),
    adjustIntensity: (f, t) => {
      (f as TiltShiftFilter).blur = t * 10;
    },
  },
  {
    name: "Zoom Blur",
    icon: "Z",
    create: () =>
      new ZoomBlurFilter({ strength: 0.3, center: { x: 0.5, y: 0.5 } }),
    adjustIntensity: (f, t) => {
      (f as ZoomBlurFilter).strength = t;
    },
  },
  {
    name: "Adjustment",
    icon: "Ad",
    create: () =>
      new AdjustmentFilter({
        gamma: 1,
        saturation: 1.2,
        contrast: 1.1,
        brightness: 1.05,
        red: 1,
        green: 1,
        blue: 1,
        alpha: 1,
      }),
    adjustIntensity: (f, t) => {
      (f as AdjustmentFilter).alpha = t;
    },
  },
];

export function applyFilterPreset(
  container: { filters?: readonly Filter[] | null },
  presetName: string,
): void {
  if (presetName === "None") {
    container.filters = null;
    return;
  }
  const preset = FILTER_PRESETS.find((p) => p.name === presetName);
  if (!preset) {
    container.filters = null;
    return;
  }
  const filter = preset.create();
  container.filters = filter ? [filter] : null;
}
