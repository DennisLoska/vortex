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
import {
  resolveAssetAlias,
  resolveFilterPreset,
  resolveLayer,
  clampCoord,
  clampScale,
  clampIntensity,
} from "./aliasResolver";
import {
  getProjectAssets,
  getProjectFixAssets,
  getProjectBackgrounds,
} from "../assetManifest";

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
    return alias.trim().startsWith(`${this.currentProject}/`);
  }

  private getAvailableAliases(): string[] {
    try {
      const fix = getProjectFixAssets(this.currentProject);
      const pool = getProjectAssets(this.currentProject).map((p) => p.key);
      const bg = getProjectBackgrounds(this.currentProject);
      return [...fix, ...pool, ...bg.videoAliases, ...bg.imageAliases];
    } catch {
      return [];
    }
  }

  private resolveAliasForContainer(
    requested: string,
    container: Container,
  ): string | null {
    const avail = this.getAvailableAliases();
    const labels = container.children.map((c) => c.label || "").filter(Boolean) as string[];
    // prefer labels present in container, then manifest
    const combined = [...new Set([...labels, ...avail])];
    const r = resolveAssetAlias(requested, combined);
    if (r.alias) {
      // ensure resolved alias actually exists in container for remove/move
      if (labels.includes(r.alias)) return r.alias;
      // for place, manifest existence is enough; container check not needed
      if (avail.includes(r.alias)) return r.alias;
      // if labels empty (no children), fallback to avail
      return r.alias;
    }
    return null;
  }

  // ─── Assets ───

  async placeAsset(
    alias: string,
    x: number,
    y: number,
    layer: "asset" | "fixed",
    scale = 0.5,
  ): Promise<boolean> {
    const trimmed = alias.trim();
    let canonical = trimmed;
    const available = this.getAvailableAliases();
    if (available.length > 0) {
      const r = resolveAssetAlias(trimmed, available);
      if (r.alias) canonical = r.alias;
    }
    if (!this.validateAlias(canonical)) return false;
    const cx = clampCoord(x, 1920);
    const cy = clampCoord(y, 1080);
    const cs = clampScale(scale);

    try {
      const ext = canonical.split(".").pop()?.toLowerCase();
      let child: Container;

      if (ext === "gif") {
        const source = await Assets.load(canonical);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        child = gif;
      } else {
        const texture = await Assets.load<Texture>(canonical);
        child = new Sprite({ texture, anchor: 0.5 });
      }

      child.position.set(cx, cy);
      child.scale.set(cs);
      child.label = canonical;

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
      // try fallback without resolver? already canonical
      return false;
    }
  }

  removeAsset(alias: string, layer: "asset" | "fixed"): boolean {
    const container = layer === "fixed" ? this.fixedLayer : this.assetLayer;
    let target = alias.trim();
    let child = container.children.find((c) => c.label === target);
    if (!child) {
      const resolved = this.resolveAliasForContainer(target, container);
      if (resolved) {
        child = container.children.find((c) => c.label === resolved);
        if (child) target = resolved;
      }
    }
    if (!child) return false;
    child.removeFromParent();
    child.destroy({ children: true });
    return true;
  }

  moveAsset(
    alias: string,
    x: number,
    y: number,
    layer: "asset" | "fixed",
  ): boolean {
    const trimmed = alias.trim();
    // try to resolve before validate to allow basename-only handling
    let canonical = trimmed;
    const avail = this.getAvailableAliases();
    // if trimmed not prefixed with project, try basename resolution
    if (!trimmed.startsWith(`${this.currentProject}/`) && avail.length > 0) {
      const r = resolveAssetAlias(trimmed, avail);
      if (r.alias) canonical = r.alias;
    } else if (avail.length > 0) {
      const r = resolveAssetAlias(trimmed, avail);
      if (r.alias) canonical = r.alias;
    }
    if (!this.validateAlias(canonical)) return false;
    const container = layer === "fixed" ? this.fixedLayer : this.assetLayer;
    const cx = clampCoord(x, 1920);
    const cy = clampCoord(y, 1080);
    let child = container.children.find((c) => c.label === canonical) || container.children.find((c) => c.label === trimmed);
    if (!child) {
      const resolved = this.resolveAliasForContainer(trimmed, container) || this.resolveAliasForContainer(canonical, container);
      if (resolved) child = container.children.find((c) => c.label === resolved) as typeof child;
    }
    if (!child) return false;
    child.position.set(cx, cy);
    return true;
  }

  // ─── Filters ───

  setFilter(layer: LayerId, presetName: string, intensity?: number): boolean {
    const resolvedLayer = resolveLayer(layer as string);
    const lid = (resolvedLayer.layer as LayerId) || layer;
    const container = this.getLayerContainer(lid);
    if (!container) return false;

    // resolve preset case-insensitive / hyphen etc.
    let canonicalPreset = presetName?.trim() ?? "";
    if (canonicalPreset && canonicalPreset !== "None") {
      const r = resolveFilterPreset(canonicalPreset, FILTER_PRESETS.map((p) => p.name));
      if (r.preset) canonicalPreset = r.preset;
    }

    const intensityClamped = intensity !== undefined ? clampIntensity(intensity) : undefined;

    this.controlState[lid].currentFilter = canonicalPreset;
    if (intensityClamped !== undefined) {
      this.controlState[lid].filterIntensity = intensityClamped;
    }

    if (canonicalPreset === "None" || !canonicalPreset) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(lid, null);
      return true;
    }

    const preset = FILTER_PRESETS.find((p) => p.name === canonicalPreset);
    if (!preset) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(lid, null);
      return false;
    }

    let filter: Filter | null = null;
    try {
      filter = preset.create();
    } catch {
      filter = null;
    }
    this.filterInstances.set(lid, filter);
    if (filter) {
      try {
        this.adjustFilterIntensity(filter, canonicalPreset, this.controlState[lid].filterIntensity);
      } catch {
        /* ignore intensity adjust failures in headless */
      }
      (container as unknown as { filters: unknown }).filters = [filter];
    } else {
      (container as unknown as { filters: unknown }).filters = null;
    }
    return true;
  }

  clearFilter(layer: LayerId): boolean {
    const resolved = resolveLayer(layer as string);
    const lid = (resolved.layer as LayerId) || layer;
    return this.setFilter(lid, "None");
  }

  adjustIntensity(layer: LayerId, pct: number): void {
    const resolved = resolveLayer(layer as string);
    const lid = (resolved.layer as LayerId) || layer;
    const clamped = clampIntensity(pct);
    const cs = this.controlState[lid];
    if (!cs) return;
    cs.filterIntensity = clamped;
    const inst = this.filterInstances.get(lid);
    if (inst) {
      this.adjustFilterIntensity(inst, cs.currentFilter, clamped);
    }
  }

  // ─── Visibility ───

  setLayerVisibility(layer: LayerId, visible: boolean): void {
    const resolved = resolveLayer(layer as string);
    const lid = (resolved.layer as LayerId) || layer;
    const cs = this.controlState[lid];
    if (!cs) return;
    cs.visible = visible;
    const container = this.getLayerContainer(lid);
    if (container) container.visible = visible;
  }

  // ─── Background ───

  async setBackground(alias: string): Promise<boolean> {
    const trimmed = alias.trim();
    let canonical = trimmed;
    try {
      const bg = getProjectBackgrounds(this.currentProject);
      const avail = [...bg.videoAliases, ...bg.imageAliases];
      if (avail.length > 0) {
        const r = resolveAssetAlias(trimmed, avail);
        if (r.alias) canonical = r.alias;
      }
    } catch {
      /* ignore */
    }
    if (!this.validateAlias(canonical)) return false;
    return this.bgLayer.setBackground(canonical);
  }

  nextBackground(): void {
    this.bgLayer.next();
  }

  // ─── Webcam ───

  setWebcamPreset(index: number): number {
    const raw = Math.floor(Number(index));
    const clamped = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(13, raw));
    this.webcam.setPreset(clamped);
    return clamped;
  }

  toggleWebcam(): void {
    this.setLayerVisibility("webcam", !this.controlState.webcam.visible);
  }

  // ─── Text ───

  setTextIndex(index: number): void {
    const raw = Math.floor(Number(index));
    const safe = Number.isNaN(raw) ? 0 : raw;
    this.textOverlay.goTo(safe);
  }

  nextText(): void {
    this.textOverlay.next();
  }

  setTextPosition(x: number, y: number): void {
    const cx = clampCoord(Number(x) || 0, 1920);
    const cy = clampCoord(Number(y) || 0, 1080);
    this.textOverlay.setTextPosition(cx, cy);
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
    const r = resolveLayer(layer as string);
    const lid = (r.layer as LayerId) || layer;
    switch (lid) {
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
