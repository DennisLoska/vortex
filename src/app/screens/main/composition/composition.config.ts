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
  { x: 0.5, y: 0.5, scale: 3.0 },
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
      wobble: 10,
      phaseSpread: 2.5,
      subdivisions: 100,
      feather: 20,
    },
  },
};

export const compositionConfig = {
  spawnInterval: { min: 7, max: 12 },
  maxAssets: 2,
};

export type CompositionConfig = typeof compositionConfig;
