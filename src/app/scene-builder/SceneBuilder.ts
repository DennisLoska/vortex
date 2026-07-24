import { Container, Sprite, Texture, Assets, type Filter } from "pixi.js";
import {
  AlphaFilter,
  BlurFilter,
  ColorMatrixFilter,
  NoiseFilter,
} from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import { engine } from "../getEngine";
import {
  getProjectAssets,
  getProjectBackgrounds,
  getProjectFixAssets,
} from "../assetManifest";
import { BackgroundLayer } from "../screens/main/composition/BackgroundLayer";
import { FixedAsset } from "../screens/main/composition/FixedAsset";
import { FixedAssetLayer } from "../screens/main/composition/FixedAssetLayer";
import { StatusOverlay } from "../screens/main/composition/StatusOverlay";
import { WebcamAsset } from "../screens/main/composition/WebcamAsset";
import { FILTER_PRESETS, getFilterPreset } from "./filterPresets";
import { TextOverlay } from "../screens/main/composition/TextOverlay";
import {
  loadStates,
  saveStates,
  type AssetEntry,
  type SceneState,
} from "./SceneState";

type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

interface LayerControlState {
  visible: boolean;
  currentFilter: string;
  filterIntensity: number;
}

export class SceneBuilder {
  private element: HTMLDivElement;
  private overlay: HTMLDivElement;
  private dropZone: HTMLDivElement;
  private visible = false;
  private activeLayer: LayerId = "background";
  private controlState: Record<LayerId, LayerControlState> = {
    background: { visible: true, currentFilter: "None", filterIntensity: 100 },
    asset: { visible: true, currentFilter: "None", filterIntensity: 100 },
    fixed: { visible: true, currentFilter: "None", filterIntensity: 100 },
    status: { visible: true, currentFilter: "None", filterIntensity: 100 },
    webcam: { visible: true, currentFilter: "None", filterIntensity: 100 },
  };
  private filterInstances = new Map<LayerId, Filter | null>();

  private currentProject = "";
  private contentEl: HTMLDivElement;
  private bgLayer: BackgroundLayer;
  private assetLayer: Container;
  private fixedLayer: FixedAssetLayer;
  private webcam: WebcamAsset;
  private statusLayer: StatusOverlay;
  private textOverlay: TextOverlay;

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
    this.webcam = webcam;
    this.statusLayer = statusLayer;
    this.textOverlay = textOverlay;
    this.currentProject = project;

    const root = document.createElement("div");
    root.id = "scene-builder";
    root.innerHTML = this.buildHTML();
    document.body.appendChild(root);
    this.element = root;

    this.overlay = document.createElement("div");
    this.overlay.id = "scene-builder-overlay";
    document.body.appendChild(this.overlay);

    this.dropZone = document.createElement("div");
    this.dropZone.id = "scene-builder-dropzone";
    this.dropZone.textContent = "Drop asset here";
    document.body.appendChild(this.dropZone);

    this.contentEl = root.querySelector(".sb-content") as HTMLDivElement;

    this.bindEvents();
    this.populateStatesDropdown();
    this.renderLayer("background");
  }

  private buildHTML(): string {
    return `
      <div class="sb-header">
        <span class="sb-title">Scene Builder</span>
        <button class="sb-close" data-action="close">✕</button>
      </div>
      <div class="sb-tabs">
        ${(["background", "asset", "fixed", "status", "webcam"] as LayerId[])
          .map(
            (id) =>
              `<button class="sb-tab" data-layer="${id}">${this.layerLabel(id)}</button>`,
          )
          .join("")}
      </div>
      <div class="sb-states-bar">
        <select class="sb-states-select"><option value="">— Saved States —</option></select>
        <button class="sb-states-save" title="Save current as new state">+</button>
        <button class="sb-states-load" title="Load selected state">↻</button>
        <button class="sb-states-del" title="Delete selected state">✕</button>
      </div>
      <div class="sb-content"></div>
    `;
  }

  private layerLabel(id: LayerId): string {
    return {
      background: "BG",
      asset: "Assets",
      fixed: "Fixed",
      status: "Status",
      webcam: "Cam",
    }[id];
  }

  private bindEvents(): void {
    this.element
      .querySelector(".sb-close")!
      .addEventListener("click", () => this.hide());

    this.element.querySelectorAll(".sb-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const layer = (tab as HTMLElement).dataset.layer as LayerId;
        this.switchTab(layer);
      });
    });

    this.overlay.addEventListener("click", () => this.hide());

    this.element
      .querySelector(".sb-states-save")
      ?.addEventListener("click", () => this.saveCurrentState());

    this.element
      .querySelector(".sb-states-load")
      ?.addEventListener("click", () => this.loadSelectedState());

    this.element
      .querySelector(".sb-states-del")
      ?.addEventListener("click", () => this.deleteSelectedState());
  }

  private switchTab(layer: LayerId): void {
    this.activeLayer = layer;
    this.element
      .querySelectorAll(".sb-tab")
      .forEach((t) => t.classList.remove("active"));
    const tab = this.element.querySelector(`[data-layer="${layer}"]`);
    if (tab) tab.classList.add("active");
    this.renderLayer(layer);
  }

  private renderLayer(layerId: LayerId): void {
    const state = this.controlState[layerId];
    const avail = this.getAvailableAssets(layerId);
    const loaded = this.getLoadedAssets(layerId);

    this.contentEl.innerHTML = this.layerContentHTML(state, avail, loaded);

    this.contentEl
      .querySelector(".sb-vis-toggle")
      ?.addEventListener("change", (e) => {
        state.visible = (e.target as HTMLInputElement).checked;
        this.setLayerVisible(layerId, state.visible);
      });

    this.contentEl
      .querySelector(".sb-filter-select")
      ?.addEventListener("change", (e) => {
        const name = (e.target as HTMLSelectElement).value;
        state.currentFilter = name;
        const sliderRow = this.contentEl.querySelector(
          ".sb-filter-slider-row",
        ) as HTMLElement;
        if (sliderRow) sliderRow.style.display = name === "None" ? "none" : "";
        this.applyFilter(layerId, name);
      });

    this.contentEl
      .querySelector(".sb-filter-slider")
      ?.addEventListener("input", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        state.filterIntensity = val;
        const label = this.contentEl.querySelector(".sb-filter-val");
        if (label) label.textContent = `${val}%`;
        const inst = this.filterInstances.get(layerId);
        if (inst)
          this.adjustFilterIntensity(
            inst,
            this.controlState[layerId].currentFilter,
            val,
          );
      });

    this.contentEl.querySelectorAll(".sb-draggable").forEach((el) => {
      el.addEventListener("dragstart", (e) =>
        this.onDragStart(e as DragEvent, (el as HTMLElement).dataset.key!),
      );
    });

    this.contentEl.querySelectorAll(".sb-loaded-remove").forEach((el) => {
      el.addEventListener("click", () => {
        this.removeAsset(layerId, (el as HTMLElement).dataset.key!);
        this.renderLayer(layerId);
      });
    });
  }

  private getLayerContainer(layerId: LayerId): Container {
    switch (layerId) {
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

  private setLayerVisible(layerId: LayerId, visible: boolean): void {
    switch (layerId) {
      case "background":
        this.bgLayer.visible = visible;
        break;
      case "asset":
        this.assetLayer.visible = visible;
        break;
      case "fixed":
        this.fixedLayer.visible = visible;
        break;
      case "status":
        this.statusLayer.visible = visible;
        break;
      case "webcam":
        this.webcam.visible = visible;
        break;
    }
  }

  private applyFilter(layerId: LayerId, presetName: string): void {
    const container = this.getLayerContainer(layerId);
    if (presetName === "None" || !presetName) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layerId, null);
      return;
    }
    const preset = FILTER_PRESETS.find((p) => p.name === presetName);
    if (!preset) {
      (container as unknown as { filters: unknown }).filters = null;
      this.filterInstances.set(layerId, null);
      return;
    }
    const filter = preset.create();
    this.filterInstances.set(layerId, filter);
    if (filter) {
      this.adjustFilterIntensity(
        filter,
        presetName,
        this.controlState[layerId].filterIntensity,
      );
      (container as unknown as { filters: unknown }).filters = [filter];
    } else {
      (container as unknown as { filters: unknown }).filters = null;
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
    if (filter instanceof ColorMatrixFilter) {
      filter.alpha = t;
    } else if (filter instanceof BlurFilter) {
      filter.strength = t * 20;
    } else if (filter instanceof NoiseFilter) {
      filter.noise = t;
    } else if (filter instanceof AlphaFilter) {
      filter.alpha = t;
    }
  }

  private layerContentHTML(
    state: LayerControlState,
    available: { key: string; type: string }[],
    loaded: { key: string; type: string; coords?: string }[],
  ): string {
    const filterOptions = FILTER_PRESETS.map(
      (p) =>
        `<option value="${p.name}" ${p.name === state.currentFilter ? "selected" : ""}>${p.icon} ${p.name}</option>`,
    ).join("");

    const availItems = available.length
      ? available
          .map(
            (a) =>
              `<li class="sb-asset-item sb-draggable" draggable="true" data-key="${a.key}">
                <span class="sb-thumb-wrap">${
                  a.type === "video"
                    ? '<span class="sb-thumb-video">▶</span>'
                    : `<img class="sb-thumb" src="/assets/${a.key}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">`
                }
                  <span class="sb-thumb-fallback" style="display:none">${a.type === "image" ? "🖼" : "🎞"}</span>
                </span>
                <span class="sb-asset-name">${a.key.split("/").pop()}</span>
              </li>`,
          )
          .join("")
      : '<li class="sb-empty">No assets available</li>';

    const loadedItems = loaded.length
      ? loaded
          .map(
            (l) =>
              `<li class="sb-asset-item sb-loaded-item">
                <span class="sb-thumb-wrap">
                  <img class="sb-thumb" src="/assets/${l.key}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
                  <span class="sb-thumb-fallback" style="display:none">${l.type === "image" ? "🖼" : l.type === "video" ? "🎬" : "🎞"}</span>
                </span>
                <span class="sb-asset-name">${l.key.split("/").pop()}</span>
                ${l.coords ? `<span class="sb-coords">${l.coords}</span>` : ""}
                <button class="sb-loaded-remove" data-key="${l.key}">✕</button>
              </li>`,
          )
          .join("")
      : '<li class="sb-empty">No assets loaded</li>';

    return `
      <div class="sb-section">
        <label class="sb-row">
          <input type="checkbox" class="sb-vis-toggle" ${state.visible ? "checked" : ""}>
          <span>Visible</span>
        </label>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Filter</div>
        <select class="sb-filter-select">${filterOptions}</select>
        <div class="sb-filter-slider-row" style="${state.currentFilter === "None" ? "display:none" : ""}">
          <input type="range" class="sb-filter-slider" min="0" max="100" value="${state.filterIntensity}">
          <span class="sb-filter-val">${state.filterIntensity}%</span>
        </div>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Available Assets <span class="sb-count">(${available.length})</span></div>
        <ul class="sb-asset-list">${availItems}</ul>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Loaded Assets <span class="sb-count">(${loaded.length})</span></div>
        <ul class="sb-asset-list">${loadedItems}</ul>
      </div>

      <div class="sb-section sb-hint">
        Drag available assets onto the canvas to add them
      </div>
    `;
  }

  private getAvailableAssets(
    layerId: LayerId,
  ): { key: string; type: string }[] {
    switch (layerId) {
      case "background": {
        const bgs = getProjectBackgrounds(this.currentProject);
        return [
          ...bgs.imageAliases.map((k) => ({ key: k, type: "image" as const })),
          ...bgs.videoAliases.map((k) => ({ key: k, type: "video" as const })),
        ];
      }
      case "asset":
        return getProjectAssets(this.currentProject);
      case "fixed":
        return getProjectFixAssets(this.currentProject).map((k) => ({
          key: k,
          type: (k.toLowerCase().endsWith(".gif") ? "gif" : "image") as string,
        }));
      case "status":
      case "webcam":
        return [];
    }
  }

  private getLoadedAssets(
    layerId: LayerId,
  ): { key: string; type: string; coords?: string }[] {
    switch (layerId) {
      case "background": {
        if (this.bgLayer.children.length === 0) return [];
        return this.bgLayer.children
          .filter((c) => c instanceof Sprite)
          .map((c) => {
            const s = c as Sprite;
            const k = s.label || s.texture.label || "background";
            return {
              key: k,
              type: k.toLowerCase().endsWith(".mp4") ? "video" : "image",
            };
          });
      }
      case "fixed":
        return this.fixedLayer.children.map((c) => {
          const alias = c instanceof FixedAsset ? c.alias : c.label;
          return {
            key: alias || `fixed-asset-${this.fixedLayer.children.indexOf(c)}`,
            type: alias?.toLowerCase().endsWith(".gif") ? "gif" : "image",
            coords: `(${Math.round(c.x)}, ${Math.round(c.y)})`,
          };
        });
      case "status":
        return [{ key: "hearts + xp + level", type: "image" }];
      case "webcam":
        return this.webcam.visible
          ? [{ key: "webcam-feed", type: "video" }]
          : [];
      case "asset":
        return this.assetLayer.children.map((c) => ({
          key: c.label || "asset",
          type: "image",
          coords: `(${Math.round(c.x)}, ${Math.round(c.y)})`,
        }));
    }
  }

  private onDragStart(e: DragEvent, key: string): void {
    e.dataTransfer?.setData(
      "text/plain",
      JSON.stringify({ layer: this.activeLayer, key }),
    );
    this.dropZone.classList.add("active");
  }

  private dropHandlers: (() => void)[] = [];

  private setupCanvasDrop(): void {
    this.dropHandlers.forEach((fn) => fn());
    this.dropHandlers = [];

    const targets = [
      engine().canvas as HTMLElement,
      this.overlay,
      this.dropZone,
    ];

    for (const el of targets) {
      const onOver = (e: Event) => e.preventDefault();
      const onDrop = (e: Event) => {
        const de = e as DragEvent;
        de.preventDefault();
        this.dropZone.classList.remove("active");
        const raw = de.dataTransfer?.getData("text/plain");
        if (!raw) return;
        try {
          const { layer, key } = JSON.parse(raw);
          this.handleDrop(layer as LayerId, key, de.clientX, de.clientY);
        } catch {
          /* bad payload */
        }
      };

      el.addEventListener("dragover", onOver);
      el.addEventListener("drop", onDrop);
      this.dropHandlers.push(() => {
        el.removeEventListener("dragover", onOver);
        el.removeEventListener("drop", onDrop);
      });
    }
  }

  private async handleDrop(
    layerId: LayerId,
    key: string,
    clientX: number,
    clientY: number,
  ): Promise<void> {
    const canvas = engine().canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const scaleX = engine().screen.width / rect.width;
    const scaleY = engine().screen.height / rect.height;

    const stageX = x * scaleX;
    const stageY = y * scaleY;

    switch (layerId) {
      case "asset":
        await this.addSpriteToAssetLayer(key, stageX, stageY);
        break;
      case "fixed":
        await this.addSpriteToFixedLayer(key, stageX, stageY);
        break;
      case "background": {
        this.bgLayer.setMultipleBackgrounds(this.currentProject);
        break;
      }
    }
    this.renderLayer(this.activeLayer);
  }

  private async addSpriteToAssetLayer(
    key: string,
    x: number,
    y: number,
  ): Promise<void> {
    const entry = getProjectAssets(this.currentProject).find(
      (a) => a.key === key,
    );
    if (!entry) return;

    try {
      if (entry.type === "gif") {
        const source = await Assets.load(key);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        gif.position.set(x, y);
        gif.scale.set(0.5);
        gif.label = key;
        this.assetLayer.addChild(gif);
        return;
      }

      const texture = await Assets.load<Texture>(key);
      const sprite = new Sprite({ texture, anchor: 0.5 });
      sprite.position.set(x, y);
      sprite.scale.set(0.5);
      sprite.label = key;
      this.assetLayer.addChild(sprite);
    } catch (err) {
      console.error("Failed to load dropped asset:", key, err);
    }
  }

  private async addSpriteToFixedLayer(
    key: string,
    x: number,
    y: number,
  ): Promise<void> {
    try {
      const ext = key.split(".").pop()?.toLowerCase();
      let child: Container;
      if (ext === "gif") {
        const source = await Assets.load(key);
        const gif = new GifSprite({ source, autoPlay: true });
        gif.anchor.set(0.5);
        child = gif;
      } else {
        const texture = await Assets.load<Texture>(key);
        child = new Sprite({ texture, anchor: 0.5 });
      }
      child.position.set(x, y);
      child.scale.set(0.5);
      child.eventMode = "static";
      child.cursor = "grab";
      child.label = key;
      this.fixedLayer.addChild(child);
      this.setupFixedDrag(child);
    } catch (err) {
      console.error("Failed to load dropped fixed asset:", key, err);
    }
  }

  private setupFixedDrag(child: Container): void {
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

  private removeAsset(layerId: LayerId, key: string): void {
    switch (layerId) {
      case "fixed": {
        const child = this.fixedLayer.children.find(
          (c) =>
            (c instanceof FixedAsset && c.alias === key) || c.label === key,
        );
        if (child) {
          child.removeFromParent();
          child.destroy({ children: true });
        }
        break;
      }
      case "background":
        if (this.bgLayer.children.length > 0) {
          const last = this.bgLayer.children[this.bgLayer.children.length - 1];
          last.removeFromParent();
          last.destroy({ children: true });
        }
        break;
    }
  }

  // ─── Scene state management ───

  private getStates(): SceneState[] {
    return loadStates(this.currentProject);
  }

  private persistStates(states: SceneState[]): void {
    saveStates(this.currentProject, states);
    this.populateStatesDropdown(states);
  }

  private populateStatesDropdown(states?: SceneState[]): void {
    const list = states ?? this.getStates();
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    if (!sel) return;
    sel.innerHTML =
      `<option value="">— Saved States —</option>` +
      list.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  }

  private serializeCurrentState(name: string): SceneState {
    const fixedAssets: AssetEntry[] = [];
    const draggedAssets: AssetEntry[] = [];

    for (const child of this.fixedLayer.children) {
      if (child instanceof FixedAsset) {
        fixedAssets.push({
          alias: child.alias,
          x: child.x,
          y: child.y,
          scale: child.spriteScale,
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
    const textOverlay = textPos
      ? {
          x: textPos.x,
          y: textPos.y,
          currentIdx: this.textOverlay.currentIndex,
        }
      : null;

    return {
      name,
      timestamp: Date.now(),
      fixedAssets,
      draggedAssets,
      layers,
      textOverlay,
    };
  }

  private saveCurrentState(): void {
    const name = prompt(
      "Name this scene state:",
      `State ${this.getStates().length + 1}`,
    );
    if (!name) return;
    const states = this.getStates();
    states.push(this.serializeCurrentState(name));
    this.persistStates(states);
  }

  private async loadSelectedState(): Promise<void> {
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    const idx = parseInt(sel?.value, 10);
    if (isNaN(idx)) return;

    const states = this.getStates();
    const st = states[idx];
    if (!st) return;

    // Clear layers
    this.fixedLayer.removeChildren();
    this.assetLayer.removeChildren();
    this.textOverlay.clear();

    // Restore layer visibility and filters
    for (const [id, layerSt] of Object.entries(st.layers)) {
      const lid = id as LayerId;
      if (this.controlState[lid]) {
        this.controlState[lid].visible = layerSt.visible;
        this.controlState[lid].currentFilter = layerSt.filter;
        this.controlState[lid].filterIntensity = layerSt.filterIntensity;
        this.setLayerVisible(lid, layerSt.visible);
        this.applyFilter(lid, layerSt.filter);
      }
    }

    // Restore fixed assets
    for (const fa of st.fixedAssets) {
      try {
        const cfg = {
          file: fa.alias.split("/").pop() || "",
          x: fa.x / 1920,
          y: fa.y / 1080,
        };
        const asset = await FixedAsset.load(fa.alias, cfg);
        asset.x = fa.x;
        asset.y = fa.y;
        asset.spriteScale = fa.scale;
        this.fixedLayer.addChild(asset);
      } catch {
        // skip failed
      }
    }

    // Restore dragged assets
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
        this.setupFixedDrag(child);
      } catch {
        // skip
      }
    }

    // Restore text overlay
    if (st.textOverlay) {
      this.textOverlay.goTo(
        st.textOverlay.currentIdx,
        st.textOverlay.x,
        st.textOverlay.y,
      );
    }

    if (this.visible) this.renderLayer(this.activeLayer);
  }

  private deleteSelectedState(): void {
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    const idx = parseInt(sel?.value, 10);
    if (isNaN(idx)) return;

    let states = this.getStates();
    states = states.filter((_, i) => i !== idx);
    this.persistStates(states);
  }

  public setProject(name: string): void {
    this.currentProject = name;
    if (this.visible) {
      this.populateStatesDropdown();
      this.renderLayer(this.activeLayer);
    }
  }

  public toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  public show(): void {
    this.visible = true;
    this.element.classList.add("open");
    this.overlay.classList.add("open");
    this.setupCanvasDrop();
    this.populateStatesDropdown();
    this.renderLayer(this.activeLayer);
  }

  public hide(): void {
    this.visible = false;
    this.element.classList.remove("open");
    this.overlay.classList.remove("open");
    this.dropZone.classList.remove("active");
  }

  public destroy(): void {
    this.element.remove();
    this.overlay.remove();
    this.dropZone.remove();
  }
}
