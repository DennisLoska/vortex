export type AnimationProfile = "gentle" | "lively" | "pop" | "none";

export type ProfileConfig = {
  rotationRange: number;
  driftSpeed: { min: number; max: number };
  scalePulse: { min: number; max: number };
  lifetime: { min: number; max: number };
  fadeDuration: number;
};

export const animationProfiles: Record<AnimationProfile, ProfileConfig> = {
  gentle: {
    rotationRange: 3,
    driftSpeed: { min: 5, max: 20 },
    scalePulse: { min: 0.97, max: 1.03 },
    lifetime: { min: 16, max: 28 },
    fadeDuration: 2.8,
  },
  lively: {
    rotationRange: 8,
    driftSpeed: { min: 15, max: 40 },
    scalePulse: { min: 0.93, max: 1.07 },
    lifetime: { min: 10, max: 16 },
    fadeDuration: 2.5,
  },
  pop: {
    rotationRange: 0,
    driftSpeed: { min: 0, max: 0 },
    scalePulse: { min: 1, max: 1 },
    lifetime: { min: 3, max: 6 },
    fadeDuration: 0,
  },
  none: {
    rotationRange: 0,
    driftSpeed: { min: 0, max: 0 },
    scalePulse: { min: 1, max: 1 },
    lifetime: { min: 0, max: 0 },
    fadeDuration: 0,
  },
};

export type WebcamPreset = { x: number; y: number; scale: number };

export const webcamPresets: WebcamPreset[] = [
  { x: 0.16, y: 0.26, scale: 1.0 },
  { x: 0.65, y: 0.2, scale: 1.0 },
  { x: 0.75, y: 0.25, scale: 1.2 },
  { x: 0.16, y: 0.65, scale: 1.0 },
  { x: 0.65, y: 0.65, scale: 1.0 },
  { x: 0.4, y: 0.28, scale: 1.0 },
  { x: 0.75, y: 0.65, scale: 1.2 },
  { x: 0.4, y: 0.65, scale: 1.0 },
  { x: 0.12, y: 0.4, scale: 1.0 },
  { x: 0.65, y: 0.4, scale: 1.0 },
  { x: 0.4, y: 0.4, scale: 1.2 },
  { x: 0.85, y: 0.65, scale: 0.8 },
  { x: 0.75, y: 0.65, scale: 1.2 },
  { x: 0.5, y: 0.5, scale: 2.1 },
];

export const webcamConfig = {
  autoJumpInterval: { min: 30, max: 60 },
  mask: {
    width: 480,
    height: 360,
    idleScalePulse: { min: 0.92, max: 1.08 },
    idleRotationRange: 3,
    blob: {
      segments: 20,
      morphSpeed: 1.0,
      wobble: 20,
      phaseSpread: 2.5,
      subdivisions: 42,
      feather: 20,
      clip: 0.4,
    },
  },
};

export const GRID_PADDING = 350;

export const compositionConfig = {
  spawnInterval: { min: 7, max: 12 },
  maxAssets: 2,
};

export const fonts = {
  poem: "Caveat, cursive",
  poemSerif: "EB Garamond, Georgia, serif",
  poemScript: "Dancing Script, cursive",
  poemModern: "Cormorant Garamond, serif",
  label: "Arial Rounded MT Bold",
  heading: "Playfair Display, Georgia, serif",
  mono: "JetBrains Mono, monospace",
};

export type CompositionConfig = typeof compositionConfig;

export interface StatusOverlayConfig {
  hearts: {
    count: number;
    filled: number;
    size: number;
    spacing: number;
    fullColor: number;
    emptyColor: number;
  };
  experienceBar: {
    current: number;
    max: number;
    width: number;
    height: number;
    color: number;
    backgroundColor: number;
    textColor: number;
  };
  level: {
    current: number;
    fontSize: number;
    color: number;
    label: string;
  };
  padding: number;
}

export const statusOverlayConfig: StatusOverlayConfig = {
  hearts: {
    count: 3,
    filled: 1,
    size: 24,
    spacing: 6,
    fullColor: 0xff0044,
    emptyColor: 0x333333,
  },
  experienceBar: {
    current: 1,
    max: 10,
    width: 220,
    height: 20,
    color: 0x00cc66,
    backgroundColor: 0x222222,
    textColor: 0xffffff,
  },
  level: {
    current: 1,
    fontSize: 32,
    color: 0xffffff,
    label: "LVL",
  },
  padding: 20,
};
