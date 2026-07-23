export interface ManifestAsset {
  alias: string[];
  src: string[];
}

export interface ManifestBundle {
  name: string;
  assets: ManifestAsset[];
}

export interface Manifest {
  bundles: ManifestBundle[];
}
