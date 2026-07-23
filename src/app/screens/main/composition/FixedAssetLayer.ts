import { Container } from "pixi.js";

import { getProjectFixAssets } from "../../../assetManifest";
import { FixedAsset, type FixedAssetConfig } from "./FixedAsset";

const fixLayoutModules = import.meta.glob("/projects/*/fix/layout.json", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

export class FixedAssetLayer extends Container {
  private fixedAssets: FixedAsset[] = [];

  public async setProject(name: string) {
    this.clear();

    const configs = await this.loadLayout(name);
    if (!configs || configs.length === 0) return;

    const fixAliases = getProjectFixAssets(name);
    if (fixAliases.length === 0) return;

    for (const cfg of configs) {
      const alias = `${name}/fix/${cfg.file}`;
      if (!fixAliases.includes(alias)) continue;

      try {
        const asset = await FixedAsset.load(alias, cfg);
        this.addChild(asset);
        this.fixedAssets.push(asset);
      } catch {
        // skip failed loads
      }
    }
  }

  private async loadLayout(name: string): Promise<FixedAssetConfig[] | null> {
    const path = `/projects/${name}/fix/layout.json`;
    const loader = fixLayoutModules[path];
    if (!loader) return null;

    try {
      const raw = await loader();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed as FixedAssetConfig[];
    } catch {
      return null;
    }
  }

  public resize(width: number, height: number) {
    for (const asset of this.fixedAssets) {
      asset.resize(width, height);
    }
  }

  public clear() {
    this.removeChildren();
    for (const asset of this.fixedAssets) {
      asset.destroy({ children: true, texture: false });
    }
    this.fixedAssets = [];
  }
}
