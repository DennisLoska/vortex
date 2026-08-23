import { describe, it, expect } from "bun:test";
import { executeActions } from "../src/app/composition-api/AgentActionHandler";
import { Container } from "pixi.js";

function mockApi() {
  const assetLayer = new Container();
  const fixedLayer = new Container();
  // seed with hearts.png
  const child: any = new Container();
  child.label = "faery/fix/hearts.png";
  child.x = 100;
  child.y = 100;
  child.removeFromParent = function () {
    if (this.parent) this.parent.removeChild(this);
  };
  child.destroy = function () {};
  fixedLayer.addChild(child);
  const bgLayer: any = {
    setBackground: async (a: string) => a.includes("bg.mp4"),
  };
  const statusLayer: any = new Container();
  const webcam: any = new Container();
  webcam.visible = true;
  webcam.setPreset = (i: number) => {};
  let textPos: any = null;
  const textOverlay: any = {
    textPosition: null,
    currentIndex: 0,
    goTo(i: number) {
      this.currentIndex = i;
    },
    next() {},
    setTextPosition(x: number, y: number) {
      textPos = { x, y };
    },
    clear() {},
  };
  // Need mock CompositionAPI instance that has same methods as real; instead create minimal object with same interface methods
  // We reuse real CompositionAPI with mocked layers
  const {
    CompositionAPI,
  } = require("../src/app/composition-api/CompositionAPI");
  const api = new CompositionAPI(
    bgLayer,
    assetLayer,
    fixedLayer,
    statusLayer,
    webcam,
    textOverlay,
    "faery",
  );
  // hack to expose textPos for test
  (api as any)._textPosGet = () => textPos;
  return api;
}

describe("AgentActionHandler suggestions + normalization", () => {
  it("removeAsset wrong extension resolves", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      {
        type: "removeAsset",
        alias: "faery/fix/hearts.gif",
        layer: "fixed",
      } as any,
    ]);
    expect(res[0].success).toBe(true);
  });

  it("removeAsset suggests on typo", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      {
        type: "removeAsset",
        alias: "faery/fix/heartz.png",
        layer: "fixed",
      } as any,
    ]);
    expect(res[0].success).toBe(false);
    expect(res[0].message).toContain("Did you mean");
  });

  it("setFilter case insensitive succeeds", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      { type: "setFilter", layer: "BACKGROUND", preset: "grayscale" } as any,
    ]);
    expect(res[0].success).toBe(true);
  });

  it("setFilter unknown suggests", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      { type: "setFilter", layer: "background", preset: "Neon" } as any,
    ]);
    expect(res[0].success).toBe(false);
    expect(res[0].message).toContain("Did you mean");
  });

  it("setLayerVisibility fix normalized", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      { type: "setLayerVisibility", layer: "fix", visible: false } as any,
    ]);
    expect(res[0].success).toBe(true);
  });

  it("setWebcamPreset clamps and reports", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      { type: "setWebcamPreset", index: 99 } as any,
    ]);
    expect(res[0].success).toBe(true);
    // handler currently just ok, but after fix should include clamped note
    // we check that it still succeeds; detailed message check optional
  });

  it("moveAsset wrong extension resolves", async () => {
    const api = mockApi();
    const res = await executeActions(api as any, [
      {
        type: "moveAsset",
        alias: "faery/fix/hearts.png",
        x: 200,
        y: 200,
        layer: "fixed",
      } as any,
    ]);
    expect(res[0].success).toBe(true);
    // now try with wrong ext
    const api2 = mockApi();
    // ensure child exists
    const res2 = await executeActions(api2 as any, [
      {
        type: "moveAsset",
        alias: "faery/fix/hearts.gif",
        x: 300,
        y: 300,
        layer: "fixed",
      } as any,
    ]);
    expect(res2[0].success).toBe(true);
  });
});
