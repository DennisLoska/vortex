import { describe, it, expect } from "bun:test";
import {
  resolveAssetAlias,
  resolveFilterPreset,
  resolveLayer,
  clampCoord,
  clampScale,
  clampIntensity,
} from "../src/app/composition-api/aliasResolver";
import { FILTER_PRESET_NAMES } from "../server/filter-presets";

describe("resolveAssetAlias", () => {
  it("exact match returns canonical", () => {
    expect(
      resolveAssetAlias("faery/fix/hearts.png", ["faery/fix/hearts.png"]).alias,
    ).toBe("faery/fix/hearts.png");
  });
  it("wrong extension unique basename resolves", () => {
    const avail = ["faery/fix/hearts.png", "faery/fix/navi.gif"];
    expect(resolveAssetAlias("faery/fix/hearts.gif", avail).alias).toBe(
      "faery/fix/hearts.png",
    );
  });
  it("case insensitive", () => {
    expect(
      resolveAssetAlias("FAERY/FIX/HEARTS.PNG", ["faery/fix/hearts.png"]).alias,
    ).toBe("faery/fix/hearts.png");
  });
  it("basename only with multiple matches returns null + suggestions", () => {
    const r = resolveAssetAlias("hearts", [
      "faery/fix/hearts.png",
      "faery/fix/hearts.gif",
    ]);
    expect(r.alias).toBeNull();
    expect(r.suggestion.length).toBe(2);
  });
  it("missing extension resolves unique", () => {
    expect(
      resolveAssetAlias("faery/fix/hearts", ["faery/fix/hearts.png"]).alias,
    ).toBe("faery/fix/hearts.png");
  });
  it("fix/fixed confusion", () => {
    expect(
      resolveAssetAlias("faery/fixed/hearts.png", ["faery/fix/hearts.png"])
        .alias,
    ).toBe("faery/fix/hearts.png");
  });
  it("trims whitespace", () => {
    expect(
      resolveAssetAlias("  faery/fix/hearts.png  ", ["faery/fix/hearts.png"])
        .alias,
    ).toBe("faery/fix/hearts.png");
  });
});

describe("resolveFilterPreset", () => {
  it("case insensitive", () => {
    expect(
      resolveFilterPreset("grayscale", [...FILTER_PRESET_NAMES]).preset,
    ).toBe("Grayscale");
  });
  it("hyphen variant", () => {
    expect(
      resolveFilterPreset("gray-scale", [...FILTER_PRESET_NAMES]).preset,
    ).toBe("Grayscale");
  });
  it("grey alias", () => {
    // grey -> gray mapping should resolve to Grayscale
    const r = resolveFilterPreset("grey", [...FILTER_PRESET_NAMES]);
    // either Grayscale or suggestion containing Grayscale
    expect(r.preset === "Grayscale" || r.suggestion.includes("Grayscale")).toBe(
      true,
    );
  });
  it("unknown suggests", () => {
    const r = resolveFilterPreset("Neon", [...FILTER_PRESET_NAMES]);
    expect(r.preset).toBeNull();
    expect(r.suggestion.length).toBeGreaterThan(0);
  });
  it("trim whitespace", () => {
    expect(
      resolveFilterPreset("  Grayscale  ", [...FILTER_PRESET_NAMES]).preset,
    ).toBe("Grayscale");
  });
});

describe("resolveLayer", () => {
  it("fix->fixed", () => {
    expect(resolveLayer("fix").layer).toBe("fixed");
  });
  it("case trim", () => {
    expect(resolveLayer(" FIX ").layer).toBe("fixed");
  });
  it("backgrounds plural", () => {
    expect(resolveLayer("backgrounds").layer).toBe("background");
  });
  it("invalid returns null", () => {
    expect(resolveLayer("bogus").layer).toBeNull();
  });
});

describe("clamps", () => {
  it("clampCoord", () => {
    expect(clampCoord(9999, 1920)).toBe(1920);
    expect(clampCoord(-10, 1920)).toBe(0);
    expect(clampCoord(960, 1920)).toBe(960);
  });
  it("clampScale", () => {
    expect(clampScale(5)).toBe(2);
    expect(clampScale(0.01)).toBe(0.1);
  });
  it("clampIntensity", () => {
    expect(clampIntensity(150)).toBe(100);
    expect(clampIntensity(-5)).toBe(0);
  });
});
