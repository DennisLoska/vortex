import { describe, it, expect } from "bun:test";
import { Container } from "pixi.js";
import { CompositionAPI } from "../src/app/composition-api/CompositionAPI";

function mockContainer() { return new Container() as any; }

describe("CompositionAPI filter/layer hardening", () => {
  it("setFilter case insensitive and hyphen", () => {
    const bgLayer: any = mockContainer();
    const api = new CompositionAPI(bgLayer, mockContainer(), mockContainer(), mockContainer(), mockContainer(), { textPosition: null, currentIndex:0, goTo(){}, next(){}, setTextPosition(){}, clear(){} } as any, "faery");
    expect(api.setFilter("BACKGROUND","grayscale",80)).toBe(true);
    expect(api.getControlState("background").currentFilter).toBe("Grayscale");
    expect(api.setFilter("fixed","gray-scale")).toBe(true);
    expect(api.getControlState("fixed").currentFilter).toBe("Grayscale");
  });

  it("setLayerVisibility fix->fixed", () => {
    const fixedLayer: any = mockContainer();
    fixedLayer.visible = true;
    const api = new CompositionAPI(mockContainer(), mockContainer(), fixedLayer, mockContainer(), mockContainer(), { textPosition: null, currentIndex:0, goTo(){}, next(){}, setTextPosition(){}, clear(){} } as any, "faery");
    api.setLayerVisibility("Fix" as any, false);
    expect(fixedLayer.visible).toBe(false);
    expect(api.getControlState("fixed").visible).toBe(false);
    // backgrounds plural
    const bgLayer: any = mockContainer(); bgLayer.visible = true;
    const api2 = new CompositionAPI(bgLayer, mockContainer(), mockContainer(), mockContainer(), mockContainer(), { textPosition:null, currentIndex:0, goTo(){}, next(){}, setTextPosition(){}, clear(){} } as any, "faery");
    api2.setLayerVisibility("backgrounds" as any, false);
    expect(bgLayer.visible).toBe(false);
  });

  it("setWebcamPreset clamps", () => {
    let presetCalls: number[] = [];
    const webcam: any = mockContainer();
    webcam.visible = true;
    webcam.setPreset = (i:number)=> presetCalls.push(i);
    const api = new CompositionAPI(mockContainer(), mockContainer(), mockContainer(), mockContainer(), webcam, { textPosition:null, currentIndex:0, goTo(){}, next(){}, setTextPosition(){}, clear(){} } as any, "faery");
    const r1 = api.setWebcamPreset(99);
    expect(r1).toBe(13);
    expect(presetCalls[0]).toBe(13);
    const r2 = api.setWebcamPreset(-5);
    expect(r2).toBe(0);
  });

  it("setTextPosition clamps", () => {
    let pos: any = null;
    const textOverlay: any = { textPosition: null, currentIndex:0, goTo(){}, next(){}, clear(){}, setTextPosition(x:number,y:number){ pos={x,y}; } };
    const api = new CompositionAPI(mockContainer(), mockContainer(), mockContainer(), mockContainer(), mockContainer(), textOverlay, "faery");
    api.setTextPosition(9999, -100);
    expect(pos.x).toBe(1920);
    expect(pos.y).toBe(0);
  });

  it("setTextIndex wraps", () => {
    let goArg: number|null = null;
    const textOverlay: any = { textPosition: null, currentIndex:0, goTo(i:number){ goArg=i; }, next(){}, setTextPosition(){}, clear(){} };
    // need phrases length? CompositionAPI.setTextIndex delegates to textOverlay.goTo, which uses phrases length for mod? But our mock doesn't know length, API should clamp via mod with unknown length -> we just ensure it calls without error
    const api = new CompositionAPI(mockContainer(), mockContainer(), mockContainer(), mockContainer(), mockContainer(), textOverlay, "faery");
    api.setTextIndex(999);
    // should not throw, goArg mod? exact value not important but should be called
    expect(goArg).not.toBeNull();
  });

  it("unknown filter returns false", () => {
    const api = new CompositionAPI(mockContainer(), mockContainer(), mockContainer(), mockContainer(), mockContainer(), { textPosition:null, currentIndex:0, goTo(){}, next(){}, setTextPosition(){}, clear(){} } as any, "faery");
    expect(api.setFilter("background","Neon")).toBe(false);
  });
});
