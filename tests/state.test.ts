import { describe, it, expect, beforeEach } from "bun:test";
import { CompositionAPI } from "../src/app/composition-api/CompositionAPI";
import { Container } from "pixi.js";
import { loadStates, saveStates } from "../src/app/scene-builder/SceneState";

// mock localStorage for Node
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem(k: string) {
    return store[k] ?? null;
  },
  setItem(k: string, v: string) {
    store[k] = v;
  },
  removeItem(k: string) {
    delete store[k];
  },
  clear() {
    for (const k in store) delete store[k];
  },
};

function mockApi(project = "faery") {
  const bgLayer: any = new Container();
  const assetLayer = new Container();
  const fixedLayer = new Container();
  const statusLayer: any = new Container();
  const webcam: any = new Container();
  webcam.visible = true;
  webcam.setPreset = () => {};
  const textOverlay: any = {
    textPosition: null,
    currentIndex: 0,
    goTo() {},
    next() {},
    setTextPosition() {},
    clear() {},
  };
  return new CompositionAPI(
    bgLayer,
    assetLayer,
    fixedLayer,
    statusLayer,
    webcam,
    textOverlay,
    project,
  );
}

describe("State tools edge cases", () => {
  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it("saveState deduplicates same name", () => {
    const api = mockApi("testproj");
    api.saveState("dup");
    api.saveState("dup");
    const states = loadStates("testproj");
    expect(states.filter((s) => s.name === "dup").length).toBe(1);
  });

  it("loadState string '0' searches name not index", async () => {
    const api = mockApi("testproj2");
    api.saveState("hello");
    api.saveState("world");
    // states: [hello, world]; index 0 is hello
    // loadState("0") string should look for name "0", not found -> false
    expect(await api.loadState("0" as any)).toBe(false);
    expect(await api.loadState(0)).toBe(true);
  });

  it("deleteState deduplicates correctly", () => {
    const api = mockApi("testproj3");
    api.saveState("a");
    api.saveState("b");
    expect(api.deleteState("a")).toBe(true);
    expect(api.deleteState("a")).toBe(false);
    expect(api.deleteState(0)).toBe(true); // deletes remaining b at index 0
    expect(api.deleteState(0 as any)).toBe(false);
  });

  it("getState returns project and structure", () => {
    const api = mockApi("testproj4");
    const s = api.getState();
    expect(s.project).toBe("testproj4");
    expect(s.layers).toBeDefined();
  });
});
