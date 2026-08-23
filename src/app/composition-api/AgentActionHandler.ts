import type { CompositionAPI, LayerId } from "./CompositionAPI";
import {
  resolveAssetAlias,
  resolveFilterPreset,
  resolveLayer,
  clampCoord,
} from "./aliasResolver";
import { FILTER_PRESETS } from "../scene-builder/filterPresets";

export type AgentAction = {
  type: string;
  [key: string]: unknown;
};

export interface ActionResult {
  action: AgentAction;
  success: boolean;
  message: string;
}

const VALID_LAYERS: LayerId[] = [
  "background",
  "asset",
  "fixed",
  "status",
  "webcam",
];

function getValidLayer(layer: unknown): LayerId | null {
  if (typeof layer !== "string") return null;
  const r = resolveLayer(layer);
  return r.layer;
}

function assetSuggestion(alias: string, api: CompositionAPI, layer?: string): string {
  try {
    const layerId = layer ? getValidLayer(layer) || (layer as LayerId) : null;
    const avail = layerId
      ? api.getLayerAssets(layerId).map((a) => a.alias)
      : api.getLoadedAssets().map((a) => a.alias);
    const pool = avail.length > 0 ? avail : api.getLoadedAssets().map((a) => a.alias);
    if (pool.length === 0) return "";
    const r = resolveAssetAlias(alias, pool);
    if (r.suggestion.length) return ` Did you mean ${r.suggestion[0]}?`;
    if (r.alias && r.alias !== alias) return ` Did you mean ${r.alias}?`;
  } catch {
    /* ignore */
  }
  return "";
}

function filterSuggestion(preset: string): string {
  const r = resolveFilterPreset(preset, FILTER_PRESETS.map((p) => p.name));
  if (r.suggestion.length) return ` Did you mean ${r.suggestion[0]}? Available: ${FILTER_PRESETS.slice(0, 5).map((p) => p.name).join(", ")}...`;
  return ` Available: ${FILTER_PRESETS.slice(0, 5).map((p) => p.name).join(", ")}...`;
}

export async function executeActions(
  api: CompositionAPI,
  actions: AgentAction[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const result = await executeAction(api, action);
    results.push(result);
  }

  return results;
}

async function executeAction(
  api: CompositionAPI,
  action: AgentAction,
): Promise<ActionResult> {
  const fail = (msg: string): ActionResult => ({
    action,
    success: false,
    message: msg,
  });
  const ok = (msg: string): ActionResult => ({
    action,
    success: true,
    message: msg,
  });

  switch (action.type) {
    case "placeAsset": {
      const { alias, x, y, layer, scale } = action as unknown as {
        alias: string;
        x: number;
        y: number;
        layer: string;
        scale?: number;
      };
      const lid = getValidLayer(layer);
      if (!lid || (lid !== "asset" && lid !== "fixed"))
        return fail(`Invalid layer: ${layer}. Valid: asset, fixed`);
      const nx = clampCoord(Number(x) || 0, 1920);
      const ny = clampCoord(Number(y) || 0, 1080);
      const success = await api.placeAsset(alias, nx, ny, lid as "asset" | "fixed", scale);
      return success
        ? ok(`Placed ${alias} on ${lid}`)
        : fail(`Failed to place ${alias}${assetSuggestion(alias, api, lid)}`);
    }

    case "removeAsset": {
      const { alias, layer } = action as unknown as {
        alias: string;
        layer: string;
      };
      const lid = getValidLayer(layer);
      if (!lid || (lid !== "asset" && lid !== "fixed"))
        return fail(`Invalid layer: ${layer}. Valid: asset, fixed`);
      const success = api.removeAsset(alias, lid as "asset" | "fixed");
      return success
        ? ok(`Removed ${alias} from ${lid}`)
        : fail(`Asset not found: ${alias}${assetSuggestion(alias, api, lid)}`);
    }

    case "moveAsset": {
      const { alias, x, y, layer } = action as unknown as {
        alias: string;
        x: number;
        y: number;
        layer: string;
      };
      const lid = getValidLayer(layer);
      if (!lid || (lid !== "asset" && lid !== "fixed"))
        return fail(`Invalid layer: ${layer}. Valid: asset, fixed`);
      const nx = clampCoord(Number(x) || 0, 1920);
      const ny = clampCoord(Number(y) || 0, 1080);
      const success = api.moveAsset(alias, nx, ny, lid as "asset" | "fixed");
      return success
        ? ok(`Moved ${alias} to (${nx}, ${ny}) on ${lid}`)
        : fail(`Asset not found: ${alias}${assetSuggestion(alias, api, lid)}`);
    }

    case "setFilter": {
      const { layer, preset, intensity } = action as unknown as {
        layer: string;
        preset: string;
        intensity?: number;
      };
      const lid = getValidLayer(layer);
      if (!lid) return fail(`Invalid layer: ${layer}. Valid: ${VALID_LAYERS.join(", ")}`);
      const success = api.setFilter(lid, preset, intensity);
      if (success) {
        const norm = resolveFilterPreset(preset, FILTER_PRESETS.map((p) => p.name));
        const canonical = norm.preset || preset;
        return ok(`Filter ${canonical} on ${lid}`);
      }
      return fail(`Unknown filter: ${preset}${filterSuggestion(preset)}`);
    }

    case "clearFilter": {
      const { layer } = action as unknown as { layer: string };
      const lid = getValidLayer(layer);
      if (!lid) return fail(`Invalid layer: ${layer}. Valid: ${VALID_LAYERS.join(", ")}`);
      const success = api.clearFilter(lid);
      return success ? ok(`Cleared filter on ${lid}`) : fail(`Failed to clear filter on ${lid}`);
    }

    case "setLayerVisibility": {
      const { layer, visible } = action as unknown as {
        layer: string;
        visible: boolean;
      };
      const lid = getValidLayer(layer);
      if (!lid) return fail(`Invalid layer: ${layer}. Valid: ${VALID_LAYERS.join(", ")}`);
      api.setLayerVisibility(lid, visible);
      return ok(`${lid} ${visible ? "shown" : "hidden"}`);
    }

    case "setBackground": {
      const { alias } = action as unknown as { alias: string };
      const success = await api.setBackground(alias);
      return success
        ? ok(`Background set to ${alias}`)
        : fail(`Invalid background: ${alias}${assetSuggestion(alias, api, "background")}`);
    }

    case "nextBackground":
      api.nextBackground();
      return ok("Next background");

    case "setWebcamPreset": {
      const { index } = action as unknown as { index: number };
      const raw = Number(index);
      const clamped = api.setWebcamPreset(raw);
      const note = clamped !== raw ? ` (clamped to ${clamped})` : "";
      return ok(`Webcam preset ${clamped}${note}`);
    }

    case "toggleWebcam":
      api.toggleWebcam();
      return ok("Webcam toggled");

    case "setTextIndex": {
      const { index } = action as unknown as { index: number };
      const raw = Math.floor(Number(index) || 0);
      api.setTextIndex(raw);
      return ok(`Text index ${raw}`);
    }

    case "nextText":
      api.nextText();
      return ok("Next text");

    case "setTextPosition": {
      const { x, y } = action as unknown as { x: number; y: number };
      const nx = clampCoord(Number(x) || 0, 1920);
      const ny = clampCoord(Number(y) || 0, 1080);
      api.setTextPosition(nx, ny);
      const note = nx !== Number(x) || ny !== Number(y) ? ` (clamped to ${nx},${ny})` : "";
      return ok(`Text moved to (${nx}, ${ny})${note}`);
    }

    case "saveState": {
      const { name } = action as unknown as { name: string };
      api.saveState(name);
      return ok(`State saved: ${name}`);
    }

    case "loadState": {
      const { nameOrIndex } = action as unknown as {
        nameOrIndex: string | number;
      };
      const success = await api.loadState(nameOrIndex);
      return success
        ? ok(`State loaded`)
        : fail(`State not found: ${nameOrIndex}`);
    }

    case "deleteState": {
      const { nameOrIndex } = action as unknown as {
        nameOrIndex: string | number;
      };
      const success = api.deleteState(nameOrIndex);
      return success
        ? ok(`State deleted`)
        : fail(`State not found: ${nameOrIndex}`);
    }

    case "getState":
      return ok(JSON.stringify(api.getState()));

    case "searchAssets":
      return ok("Search handled by server");

    case "createProject":
      return ok("Project creation handled by server");

    default:
      return fail(`Unknown action type: ${action.type}`);
  }
}
