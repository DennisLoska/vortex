import { Container, Sprite, Texture, Assets } from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import type { Filter } from "pixi.js";
import {
  AlphaFilter,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
} from "pixi.js";
import type { BackgroundLayer } from "../screens/main/composition/BackgroundLayer";
import type { FixedAssetLayer } from "../screens/main/composition/FixedAssetLayer";
import type { StatusOverlay } from "../screens/main/composition/StatusOverlay";
import type { WebcamAsset } from "../screens/main/composition/WebcamAsset";
import type { TextOverlay } from "../screens/main/composition/TextOverlay";
import {
  FILTER_PRESETS,
  getFilterPreset,
} from "../scene-builder/filterPresets";
import {
  loadStates,
  saveStates,
  type AssetEntry,
  type SceneState,
} from "../scene-builder/SceneState";

export type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

export interface AssetInfo {
  alias: string;
  type: string;
  x?: number;
  y?: number;
}

export interface SerializedCompositionState {
  project: string;
  fixedAssets: AssetEntry[];
  draggedAssets: AssetEntry[];
  layers: Record<
    string,
    { visible: boolean; filter: string; filterIntensity: number }
  >;
  textOverlay: { x: number; y: number; currentIdx: number } | null;
}

export class CompositionAPI {
  private bgLayer: BackgroundLayer;
  private assetLayer: Container;
  private fixedLayer: FixedAssetLayer;
  private statusLayer: StatusOverlay;
  private webcam: WebcamAsset;
  private textOverlay: TextOverlay;
  private currentProject: string;
  private filterInstances = new Map<LayerId, Filter | null>();
  private controlState: Record<
    LayerId,
    { visible: boolean; currentFilter: string; filterIntensity: number }
  > = {
    background: { visible: true, currentFilter: "None", filterIntensity: 100 },
    asset: { visible: true, currentFilter: "None", filterIntensity: 100 },
    fixed: { visible: true, currentFilter: "None", filterIntensity: 100 },
    status: { visible: true, currentFilter: "None", filterIntensity: 100 },
    webcam: { visible: true, currentFilter: "None", filterIntensity: 100 },
  };

  constructor(
    bgLayer: BackgroundLayer,
    assetLayer: Container,
    fixedLayer: FixedAssetLayer,
    statusLayer: StatusOverlay,
    webcam: WebcamAsset,
    textOverlay: TextOverlay,
    project: string,
  ) {
    this.bgLayer = bgLayer;
    this.assetLayer = assetLayer;
    this.fixedLayer = fixedLayer;
    this.statusLayer = statusLayer;
    this.webcam = webcam;
    this.textOverlay = textOverlay;
    this.currentProject = project;
  }

  // ─── Guardrail ───

  private validateAlias(alias: string): boolean {
    return alias.startsWith(`${this.currentProject}/`);
  }

  // ─── Assets ───

  async placeAsset(
    alias: string,
    x: number,
    y: number,
    layer: "asset" | "fixed",
    scale = 0.5,
  ): Promise<boolean> {
    if (!this.validateAlias(alias)) return false;

    try {
      const ext = alias.split(".").pop()?.toLowerCase();
      let child: Container;

      if (ext === "gif") {
        const source = await Assets.load(alias);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        child = gif;
      } else {
        const texture = await Assets.load<Texture>(alias);
        child = new Sprite({ texture, anchor: 0.5 });
      }

      child.position.set(x, y);
      child.scale.set(scale);
      child.label = alias;

      if (layer === "fixed") {
        child.eventMode = "static";
        child.cursor = "grab";
        this.fixedLayer.addChild(child);
        this.setupDrag(child);
      } else {
        this.assetLayer.addChild(child);
      }

      return true;
    } catch {
      return false;
    }
  }

  removeAsset(alias: string, layer: "asset" | "fixed"): boolean {
    const container = layer === "fixed" ? this.fixedLayer : this.assetLayer;
    const child = container.children.find((c) => c.label === alias);
    if (!child) return false;
    child.removeFromParent();
    child.destroy({ children: true });
    return true;
  }

  // ─── Filters ───

  setFilter(layer: LayerId, presetName: string, intensity?: number): boolean {
    const container = this.getLayerContainer(layer);
    if (!container) return false;

    this.controlState[layer].currentFilter = presetName;
    if (intensity !== undefined) {
      this.controlState[layer].filterIntensity = intensity;
    }

    if (presetName === "None" || !presetName) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layer, null);
      return true;
    }

    const preset = FILTER_PRESETS.find((p) => p.name === presetName);
    if (!preset) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layer, null);
      return false;
    }

    const filter = preset.create();
    this.filterInstances.set(layer, filter);
    if (filter) {
      this.adjustFilterIntensity(
        filter,
        presetName,
        this.controlState[layer].filterIntensity,
      );
      (container as unknown as { filters: unknown }).filters = [filter];
    } else {
      (container as unknown as { filters: unknown }).filters = null;
    }
    return true;
  }

  clearFilter(layer: LayerId): boolean {
    return this.setFilter(layer, "None");
  }

  adjustIntensity(layer: LayerId, pct: number): void {
    this.controlState[layer].filterIntensity = pct;
    const inst = this.filterInstances.get(layer);
    if (inst) {
      this.adjustFilterIntensity(
        inst,
        this.controlState[layer].currentFilter,
        pct,
      );
    }
  }

  // ─── Visibility ───

  setLayerVisibility(layer: LayerId, visible: boolean): void {
    this.controlState[layer].visible = visible;
    const container = this.getLayerContainer(layer);
    if (container) container.visible = visible;
  }

  // ─── Background ───

  async setBackground(alias: string): Promise<boolean> {
    if (!this.validateAlias(alias)) return false;
    return this.bgLayer.setBackground(alias);
  }

  nextBackground(): void {
    this.bgLayer.next();
  }

  // ─── Webcam ───

  setWebcamPreset(index: number): void {
    this.webcam.setPreset(index);
  }

  toggleWebcam(): void {
    this.setLayerVisibility("webcam", !this.controlState.webcam.visible);
  }

  // ─── Text ───

  setTextIndex(index: number): void {
    this.textOverlay.goTo(index);
  }

  nextText(): void {
    this.textOverlay.next();
  }

  setTextPosition(x: number, y: number): void {
    this.textOverlay.setTextPosition(x, y);
  }

  // ─── State ───

  saveState(name: string): SceneState {
    const state = this.serializeState(name);
    const states = loadStates(this.currentProject);
    states.push(state);
    saveStates(this.currentProject, states);
    return state;
  }

  async loadState(nameOrIndex: string | number): Promise<boolean> {
    const states = loadStates(this.currentProject);
    let st: SceneState | undefined;

    if (typeof nameOrIndex === "number") {
      st = states[nameOrIndex];
    } else {
      st = states.find((s) => s.name === nameOrIndex);
    }
    if (!st) return false;

    this.fixedLayer.removeChildren();
    this.assetLayer.removeChildren();
    this.textOverlay.clear();

    for (const [id, layerSt] of Object.entries(st.layers)) {
      const lid = id as LayerId;
      if (this.controlState[lid]) {
        this.controlState[lid].visible = layerSt.visible;
        this.controlState[lid].currentFilter = layerSt.filter;
        this.controlState[lid].filterIntensity = layerSt.filterIntensity;
        this.setLayerVisibility(lid, layerSt.visible);
        this.setFilter(lid, layerSt.filter, layerSt.filterIntensity);
      }
    }

    for (const fa of st.fixedAssets) {
      try {
        const { FixedAsset: FA } =
          await import("../screens/main/composition/FixedAsset");
        const asset = await FA.load(fa.alias, {
          file: fa.alias.split("/").pop() || "",
          x: fa.x / 1920,
          y: fa.y / 1080,
        });
        asset.x = fa.x;
        asset.y = fa.y;
        asset.spriteScale = fa.scale;
        this.fixedLayer.addChild(asset);
      } catch {
        /* skip */
      }
    }

    for (const da of st.draggedAssets) {
      if (!da.alias) continue;
      try {
        const ext = da.alias.split(".").pop()?.toLowerCase();
        let child: Container;
        if (ext === "gif") {
          const source = await Assets.load(da.alias);
          const gif = new GifSprite({ source, autoPlay: true });
          gif.anchor.set(0.5);
          child = gif;
        } else {
          const texture = await Assets.load<Texture>(da.alias);
          child = new Sprite({ texture, anchor: 0.5 });
        }
        child.position.set(da.x, da.y);
        child.scale.set(da.scale);
        child.label = da.alias;
        child.eventMode = "static";
        child.cursor = "grab";
        this.fixedLayer.addChild(child);
        this.setupDrag(child);
      } catch {
        /* skip */
      }
    }

    if (st.textOverlay) {
      this.textOverlay.goTo(
        st.textOverlay.currentIdx,
        st.textOverlay.x,
        st.textOverlay.y,
      );
    }

    return true;
  }

  deleteState(nameOrIndex: string | number): boolean {
    const states = loadStates(this.currentProject);
    let filtered: SceneState[];

    if (typeof nameOrIndex === "number") {
      filtered = states.filter((_, i) => i !== nameOrIndex);
    } else {
      filtered = states.filter((s) => s.name !== nameOrIndex);
    }

    if (filtered.length === states.length) return false;
    saveStates(this.currentProject, filtered);
    return true;
  }

  getState(): SerializedCompositionState {
    return {
      project: this.currentProject,
      ...this.serializeState("current"),
    };
  }

  // ─── Info ───

  getCurrentProject(): string {
    return this.currentProject;
  }

  setProject(name: string): void {
    this.currentProject = name;
  }

  getAvailableAssets(): AssetInfo[] {
    return [];
  }

  getLoadedAssets(): AssetInfo[] {
    const loaded: AssetInfo[] = [];
    for (const child of this.assetLayer.children) {
      loaded.push({
        alias: child.label || "unknown",
        type: "image",
        x: child.x,
        y: child.y,
      });
    }
    for (const child of this.fixedLayer.children) {
      loaded.push({
        alias: child.label || "unknown",
        type: "image",
        x: child.x,
        y: child.y,
      });
    }
    return loaded;
  }

  getLayerAssets(layerId: LayerId): AssetInfo[] {
    switch (layerId) {
      case "background":
        return this.bgLayer.children
          .filter((c): c is Sprite => c instanceof Sprite)
          .map((s) => {
            const k = s.label || s.texture.label || "background";
            return {
              alias: k,
              type: k.toLowerCase().endsWith(".mp4") ? "video" : "image",
            };
          });
      case "fixed":
        return this.fixedLayer.children.map((c, i) => {
          const alias =
            (c as unknown as { alias?: string }).alias ||
            c.label ||
            `fixed-asset-${i}`;
          return {
            alias,
            type: alias.toLowerCase().endsWith(".gif") ? "gif" : "image",
            x: c.x,
            y: c.y,
          };
        });
      case "status":
        return [{ alias: "hearts + xp + level", type: "image" }];
      case "webcam":
        return this.webcam.visible
          ? [{ alias: "webcam-feed", type: "video" }]
          : [];
      case "asset":
        return this.assetLayer.children.map((c) => ({
          alias: c.label || "asset",
          type: "image",
          x: c.x,
          y: c.y,
        }));
    }
  }

  getFilterPresets(): string[] {
    return FILTER_PRESETS.map((p) => p.name);
  }

  getControlState(layer: LayerId) {
    return { ...this.controlState[layer] };
  }

  // ─── Internal ───

  private getLayerContainer(layer: LayerId): Container | null {
    switch (layer) {
      case "background":
        return this.bgLayer;
      case "asset":
        return this.assetLayer;
      case "fixed":
        return this.fixedLayer;
      case "status":
        return this.statusLayer;
      case "webcam":
        return this.webcam;
    }
  }

  private adjustFilterIntensity(
    filter: Filter,
    presetName: string,
    pct: number,
  ): void {
    const preset = getFilterPreset(presetName);
    if (preset?.adjustIntensity) {
      preset.adjustIntensity(filter, Math.max(0, Math.min(100, pct)) / 100);
      return;
    }
    const t = Math.max(0, Math.min(100, pct)) / 100;
    if (filter instanceof ColorMatrixFilter) filter.alpha = t;
    else if (filter instanceof BlurFilter) filter.strength = t * 20;
    else if (filter instanceof NoiseFilter) filter.noise = t;
    else if (filter instanceof AlphaFilter) filter.alpha = t;
  }

  private serializeState(name: string): SceneState {
    const fixedAssets: AssetEntry[] = [];
    const draggedAssets: AssetEntry[] = [];

    for (const child of this.fixedLayer.children) {
      if (child.constructor.name === "FixedAsset") {
        fixedAssets.push({
          alias: (child as unknown as { alias: string }).alias,
          x: child.x,
          y: child.y,
          scale: (child as unknown as { spriteScale: number }).spriteScale,
        });
      } else {
        draggedAssets.push({
          alias: child.label || "",
          x: child.x,
          y: child.y,
          scale: child.scale.x,
        });
      }
    }

    for (const child of this.assetLayer.children) {
      draggedAssets.push({
        alias: child.label || "",
        x: child.x,
        y: child.y,
        scale: child.scale.x,
      });
    }

    const layers: Record<
      string,
      { visible: boolean; filter: string; filterIntensity: number }
    > = {};
    for (const [id, st] of Object.entries(this.controlState)) {
      layers[id] = {
        visible: st.visible,
        filter: st.currentFilter,
        filterIntensity: st.filterIntensity,
      };
    }

    const textPos = this.textOverlay.textPosition;
    return {
      name,
      timestamp: Date.now(),
      fixedAssets,
      draggedAssets,
      layers,
      textOverlay: textPos
        ? {
            x: textPos.x,
            y: textPos.y,
            currentIdx: this.textOverlay.currentIndex,
          }
        : null,
    };
  }

  private setupDrag(child: Container): void {
    let dragging = false;
    let offset = { x: 0, y: 0 };

    child.on("pointerdown", (e) => {
      dragging = true;
      child.cursor = "grabbing";
      const parent = child.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      offset = { x: child.x - pos.x, y: child.y - pos.y };
    });

    child.on("globalpointermove", (e) => {
      if (!dragging) return;
      const parent = child.parent;
      if (!parent) return;
      const pos = parent.toLocal(e.global);
      child.x = pos.x + offset.x;
      child.y = pos.y + offset.y;
    });

    const stop = () => {
      dragging = false;
      child.cursor = "grab";
    };
    child.on("pointerup", stop);
    child.on("pointerupoutside", stop);
  }
}
