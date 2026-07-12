export const compositionConfig = {
  spawnInterval: { min: 0.5, max: 1.5 },
  maxAssets: 12,
  assetLifetime: { min: 6, max: 14 },
  textPhrases: ["hello", "vortex", "flow", "glitch", "dream", "now"],
  textWeight: 0.2,
  behaviorWeights: {
    float: 0.25,
    drift: 0.35,
    orbit: 0.25,
    pulse: 0.15,
  },
  backgroundAssetName: "background",
  webcam: {
    scale: 0.2,
    jumpInterval: { min: 10, max: 20 },
    margin: 24,
    corners: ["top-left", "top-right", "bottom-left", "bottom-right"] as const,
  },
};

export type CompositionConfig = typeof compositionConfig;
export type WebcamCorner = (typeof compositionConfig.webcam.corners)[number];
