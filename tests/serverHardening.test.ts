import { describe, it, expect } from "bun:test";
import { buildSystemPrompt } from "../server/system-prompt";
import {
  resolveAssetAlias,
  resolveFilterPreset,
  resolveLayer,
} from "../server/utils/aliasResolver";

describe("server correction + prompt hardening", () => {
  it("resolveAssetAlias corrects wrong extension", () => {
    const avail = ["faery/fix/hearts.png", "faery/fix/navi.gif"];
    const r = resolveAssetAlias("faery/fix/hearts.gif", avail);
    expect(r.alias).toBe("faery/fix/hearts.png");
  });

  it("resolveFilterPreset corrects case", () => {
    const r = resolveFilterPreset("grayscale", ["Grayscale", "Sepia"]);
    expect(r.preset).toBe("Grayscale");
  });

  it("resolveLayer fix->fixed", () => {
    expect(resolveLayer("fix").layer).toBe("fixed");
  });

  it("system prompt contains hardened verbatim rule", () => {
    const prompt = buildSystemPrompt(
      "faery",
      [{ alias: "faery/fix/hearts.png", type: "image" }],
      ["faery/backgrounds/bg.mp4"],
      ["Grayscale", "Sepia"],
      "{}",
    );
    expect(prompt).toContain(
      "Copy alias verbatim including extension and case",
    );
    expect(prompt).toContain('layer param MUST be "fixed"');
    expect(prompt).toContain("grey");
  });

  it("server chat validActions rewriting logic exists (check file contains resolver import)", async () => {
    const content = await Bun.file("server/routes/chat.ts").text();
    expect(content).toContain("resolveAssetAlias");
    expect(content).toContain("resolveFilterPreset");
    expect(content).toContain("resolveLayer");
  });
});
