export type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";

export type AgentAction =
  | {
      type: "placeAsset";
      alias: string;
      x: number;
      y: number;
      layer: "asset" | "fixed";
      scale?: number;
    }
  | { type: "removeAsset"; alias: string; layer: "asset" | "fixed" }
  | { type: "setFilter"; layer: LayerId; preset: string; intensity?: number }
  | { type: "setLayerVisibility"; layer: LayerId; visible: boolean }
  | { type: "setBackground"; alias: string }
  | { type: "nextBackground" }
  | { type: "setWebcamPreset"; index: number }
  | { type: "toggleWebcam" }
  | { type: "setTextIndex"; index: number }
  | { type: "nextText" }
  | { type: "setTextPosition"; x: number; y: number }
  | { type: "saveState"; name: string }
  | { type: "loadState"; nameOrIndex: string | number }
  | { type: "deleteState"; nameOrIndex: string | number }
  | { type: "getState" }
  | { type: "searchAssets"; query: string }
  | { type: "createProject"; name: string; language: "EN" | "DE" };

export interface AgentResponse {
  actions: AgentAction[];
  explanation: string;
}

export interface ChatRequest {
  message: string;
  project: string;
  state: string;
}
