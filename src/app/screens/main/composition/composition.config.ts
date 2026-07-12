export type AnimationProfile = "gentle" | "lively" | "none";

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
    lifetime: { min: 8, max: 14 },
    fadeDuration: 0.8,
  },
  lively: {
    rotationRange: 8,
    driftSpeed: { min: 15, max: 40 },
    scalePulse: { min: 0.93, max: 1.07 },
    lifetime: { min: 5, max: 8 },
    fadeDuration: 0.5,
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
  { x: 0.12, y: 0.12, scale: 1.0 },
  { x: 0.65, y: 0.12, scale: 1.0 },
  { x: 0.12, y: 0.65, scale: 1.0 },
  { x: 0.65, y: 0.65, scale: 1.0 },
  { x: 0.4, y: 0.12, scale: 1.0 },
  { x: 0.4, y: 0.65, scale: 1.0 },
  { x: 0.12, y: 0.4, scale: 1.0 },
  { x: 0.65, y: 0.4, scale: 1.0 },
  { x: 0.4, y: 0.4, scale: 1.2 },
  { x: 0.65, y: 0.65, scale: 0.8 },
];

export const webcamConfig = {
  autoJumpInterval: { min: 30, max: 60 },
  mask: {
    cornerRadius: 24,
    width: 480,
    height: 360,
    idleScalePulse: { min: 0.92, max: 1.08 },
    idleRotationRange: 3,
    idleCycle: 5,
    edgeFadeRadius: 60,
  },
};

export const compositionConfig = {
  spawnInterval: { min: 0.5, max: 1.5 },
  maxAssets: 12,
  backgroundAssetName: "background",
};

export type CompositionConfig = typeof compositionConfig;
