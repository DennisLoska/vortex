export interface AssetEntry {
  alias: string;
  x: number;
  y: number;
  scale: number;
}

export interface LayerStateEntry {
  visible: boolean;
  filter: string;
  filterIntensity: number;
}

export interface TextOverlayEntry {
  x: number;
  y: number;
  currentIdx: number;
}

export interface SceneState {
  name: string;
  timestamp: number;
  fixedAssets: AssetEntry[];
  draggedAssets: AssetEntry[];
  layers: Record<string, LayerStateEntry>;
  textOverlay: TextOverlayEntry | null;
}

const STORAGE_KEY = "vortex-scene-states";

export function loadStates(project: string): SceneState[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${project}`);
    return raw ? (JSON.parse(raw) as SceneState[]) : [];
  } catch {
    return [];
  }
}

export function saveStates(project: string, states: SceneState[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY}:${project}`, JSON.stringify(states));
  } catch {
    // storage full or unavailable
  }
}
