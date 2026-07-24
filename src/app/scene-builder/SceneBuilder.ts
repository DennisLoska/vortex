import { engine } from "../getEngine";
import {
  getProjectAssets,
  getProjectBackgrounds,
  getProjectFixAssets,
} from "../assetManifest";
import { FILTER_PRESETS } from "./filterPresets";
import { loadStates } from "./SceneState";
import type {
  CompositionAPI,
  LayerId,
} from "../composition-api/CompositionAPI";

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
  private currentProject = "";
  private contentEl: HTMLDivElement;
  private api: CompositionAPI;

  constructor(api: CompositionAPI, project: string) {
    this.api = api;
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
    const state = this.api.getControlState(layerId);
    const avail = this.getAvailableAssets(layerId);
    const loaded = this.getLoadedAssets(layerId);

    this.contentEl.innerHTML = this.layerContentHTML(state, avail, loaded);

    this.contentEl
      .querySelector(".sb-vis-toggle")
      ?.addEventListener("change", (e) => {
        const visible = (e.target as HTMLInputElement).checked;
        this.api.setLayerVisibility(layerId, visible);
      });

    this.contentEl
      .querySelector(".sb-filter-select")
      ?.addEventListener("change", (e) => {
        const name = (e.target as HTMLSelectElement).value;
        const sliderRow = this.contentEl.querySelector(
          ".sb-filter-slider-row",
        ) as HTMLElement;
        if (sliderRow) sliderRow.style.display = name === "None" ? "none" : "";
        this.api.setFilter(layerId, name);
      });

    this.contentEl
      .querySelector(".sb-filter-slider")
      ?.addEventListener("input", (e) => {
        const val = parseInt((e.target as HTMLInputElement).value, 10);
        const label = this.contentEl.querySelector(".sb-filter-val");
        if (label) label.textContent = `${val}%`;
        const current = this.api.getControlState(layerId).currentFilter;
        this.api.setFilter(layerId, current, val);
      });

    this.contentEl.querySelectorAll(".sb-draggable").forEach((el) => {
      el.addEventListener("dragstart", (e) =>
        this.onDragStart(e as DragEvent, (el as HTMLElement).dataset.key!),
      );
    });

    this.contentEl.querySelectorAll(".sb-loaded-remove").forEach((el) => {
      el.addEventListener("click", () => {
        const key = (el as HTMLElement).dataset.key!;
        if (layerId === "asset" || layerId === "fixed") {
          this.api.removeAsset(key, layerId);
        }
        this.renderLayer(layerId);
      });
    });
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
    return this.api.getLayerAssets(layerId).map((a) => ({
      key: a.alias,
      type: a.type,
      coords:
        a.x !== undefined && a.y !== undefined
          ? `(${Math.round(a.x)}, ${Math.round(a.y)})`
          : undefined,
    }));
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
      case "fixed":
        await this.api.placeAsset(key, stageX, stageY, layerId);
        break;
      case "background": {
        await this.api.setBackground(key);
        break;
      }
    }
    this.renderLayer(this.activeLayer);
  }

  // ─── Scene state management ───

  private populateStatesDropdown(): void {
    const list = loadStates(this.currentProject);
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    if (!sel) return;
    sel.innerHTML =
      `<option value="">— Saved States —</option>` +
      list.map((s, i) => `<option value="${i}">${s.name}</option>`).join("");
  }

  private saveCurrentState(): void {
    const name = prompt(
      "Name this scene state:",
      `State ${loadStates(this.currentProject).length + 1}`,
    );
    if (!name) return;
    this.api.saveState(name);
    this.populateStatesDropdown();
  }

  private async loadSelectedState(): Promise<void> {
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    const idx = parseInt(sel?.value, 10);
    if (isNaN(idx)) return;

    await this.api.loadState(idx);
    if (this.visible) this.renderLayer(this.activeLayer);
  }

  private deleteSelectedState(): void {
    const sel = this.element.querySelector(
      ".sb-states-select",
    ) as HTMLSelectElement;
    const idx = parseInt(sel?.value, 10);
    if (isNaN(idx)) return;

    this.api.deleteState(idx);
    this.populateStatesDropdown();
  }

  public setProject(name: string): void {
    this.currentProject = name;
    this.api.setProject(name);
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
