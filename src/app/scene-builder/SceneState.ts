export interface FixedAssetEntry {
  alias: string;
  x: number;
  y: number;
  scale: number;
}

export interface DraggedAssetEntry {
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

export interface SceneState {
  name: string;
  timestamp: number;
  fixedAssets: FixedAssetEntry[];
  draggedAssets: DraggedAssetEntry[];
  layers: Record<string, LayerStateEntry>;
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
