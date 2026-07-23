import {
  AlphaFilter,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
  type Filter,
} from "pixi.js";

export interface FilterPreset {
  name: string;
  create: () => Filter | null;
  icon: string;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { name: "None", icon: "✕", create: () => null },
  {
    name: "Grayscale",
    icon: "◐",
    create: () => {
      const f = new ColorMatrixFilter();
      f.greyscale(1, false);
      return f;
    },
  },
  {
    name: "Sepia",
    icon: "🟫",
    create: () => {
      const f = new ColorMatrixFilter();
      f.sepia(false);
      return f;
    },
  },
  {
    name: "Vintage",
    icon: "📷",
    create: () => {
      const f = new ColorMatrixFilter();
      f.vintage(false);
      return f;
    },
  },
  {
    name: "Kodachrome",
    icon: "🎞",
    create: () => {
      const f = new ColorMatrixFilter();
      f.kodachrome(false);
      return f;
    },
  },
  {
    name: "Polaroid",
    icon: "🖼",
    create: () => {
      const f = new ColorMatrixFilter();
      f.polaroid(false);
      return f;
    },
  },
  {
    name: "Bright",
    icon: "☀",
    create: () => {
      const f = new ColorMatrixFilter();
      f.brightness(1.5, false);
      return f;
    },
  },
  {
    name: "Contrast",
    icon: "◑",
    create: () => {
      const f = new ColorMatrixFilter();
      f.contrast(0.5, true);
      return f;
    },
  },
  {
    name: "Night",
    icon: "🌙",
    create: () => {
      const f = new ColorMatrixFilter();
      f.night(0.5, false);
      return f;
    },
  },
  {
    name: "Blur Light",
    icon: "◎",
    create: () => new BlurFilter({ strength: 2, quality: 3 }),
  },
  {
    name: "Blur Heavy",
    icon: "◌",
    create: () => new BlurFilter({ strength: 8, quality: 5 }),
  },
  {
    name: "Noise Light",
    icon: "▦",
    create: () => new NoiseFilter({ noise: 0.15, seed: Math.random() }),
  },
  {
    name: "Noise Heavy",
    icon: "▤",
    create: () => new NoiseFilter({ noise: 0.5, seed: Math.random() }),
  },
  {
    name: "Alpha 50%",
    icon: "◻",
    create: () => new AlphaFilter({ alpha: 0.5 }),
  },
];

export function applyFilterPreset(
  container: { filters?: Filter[] | null },
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
