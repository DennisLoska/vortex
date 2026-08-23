import type { CompositionAPI, LayerId } from "./CompositionAPI";

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

function isValidLayer(layer: unknown): layer is LayerId {
  return typeof layer === "string" && VALID_LAYERS.includes(layer as LayerId);
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
        layer: "asset" | "fixed";
        scale?: number;
      };
      if (layer !== "asset" && layer !== "fixed")
        return fail(`Invalid layer: ${layer}`);
      const success = await api.placeAsset(alias, x, y, layer, scale);
      return success ? ok(`Placed ${alias}`) : fail(`Failed to place ${alias}`);
    }

    case "removeAsset": {
      const { alias, layer } = action as unknown as {
        alias: string;
        layer: "asset" | "fixed";
      };
      if (layer !== "asset" && layer !== "fixed")
        return fail(`Invalid layer: ${layer}`);
      const success = api.removeAsset(alias, layer);
      return success
        ? ok(`Removed ${alias}`)
        : fail(`Asset not found: ${alias}`);
    }

    case "moveAsset": {
      const { alias, x, y, layer } = action as unknown as {
        alias: string;
        x: number;
        y: number;
        layer: "asset" | "fixed";
      };
      if (layer !== "asset" && layer !== "fixed")
        return fail(`Invalid layer: ${layer}`);
      const success = api.moveAsset(alias, x, y, layer);
      return success
        ? ok(`Moved ${alias} to (${x}, ${y})`)
        : fail(`Asset not found: ${alias}`);
    }

    case "setFilter": {
      const { layer, preset, intensity } = action as unknown as {
        layer: string;
        preset: string;
        intensity?: number;
      };
      if (!isValidLayer(layer)) return fail(`Invalid layer: ${layer}`);
      const success = api.setFilter(layer, preset, intensity);
      return success
        ? ok(`Filter ${preset} on ${layer}`)
        : fail(`Unknown filter: ${preset}`);
    }

    case "clearFilter": {
      const { layer } = action as unknown as { layer: string };
      if (!isValidLayer(layer)) return fail(`Invalid layer: ${layer}`);
      const success = api.clearFilter(layer);
      return success ? ok(`Cleared filter on ${layer}`) : fail(`Failed`);
    }

    case "setLayerVisibility": {
      const { layer, visible } = action as unknown as {
        layer: string;
        visible: boolean;
      };
      if (!isValidLayer(layer)) return fail(`Invalid layer: ${layer}`);
      api.setLayerVisibility(layer, visible);
      return ok(`${layer} ${visible ? "shown" : "hidden"}`);
    }

    case "setBackground": {
      const { alias } = action as unknown as { alias: string };
      const success = await api.setBackground(alias);
      return success
        ? ok(`Background set`)
        : fail(`Invalid background: ${alias}`);
    }

    case "nextBackground":
      api.nextBackground();
      return ok("Next background");

    case "setWebcamPreset": {
      const { index } = action as unknown as { index: number };
      api.setWebcamPreset(index);
      return ok(`Webcam preset ${index}`);
    }

    case "toggleWebcam":
      api.toggleWebcam();
      return ok("Webcam toggled");

    case "setTextIndex": {
      const { index } = action as unknown as { index: number };
      api.setTextIndex(index);
      return ok(`Text index ${index}`);
    }

    case "nextText":
      api.nextText();
      return ok("Next text");

    case "setTextPosition": {
      const { x, y } = action as unknown as { x: number; y: number };
      api.setTextPosition(x, y);
      return ok(`Text moved to (${x}, ${y})`);
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
