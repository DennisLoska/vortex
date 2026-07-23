import * as path from "node:path";
import * as fs from "node:fs";
import type { AssetPackConfig } from "@assetpack/core";
import { AssetPack } from "@assetpack/core";
import { pixiPipes } from "@assetpack/core/pixi";
import type { Plugin } from "vite";

const IMG_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);
// texts loaded via import.meta.glob in TextOverlay.ts, not manifest

function generateManifest(entry: string): void {
  const bundles: {
    name: string;
    assets: { alias: string[]; src: string[] }[];
  }[] = [];
  const assets: { alias: string[]; src: string[] }[] = [];

  function walk(dir: string, prefix: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(full, rel);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const keep = IMG_EXTS.has(ext) || VIDEO_EXTS.has(ext);
        if (!keep) continue;
        const alias = [rel];
        if (ext !== ".txt") alias.push(entry.name);
        assets.push({ alias, src: [rel] });
      }
    }
  }

  walk(entry, "");
  bundles.push({ name: "default", assets });
  fs.writeFileSync("src/manifest.json", JSON.stringify({ bundles }, null, 2));
}

function fastCopy(src: string, dest: string): void {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (f) => !f.endsWith("prompt.txt"),
  });
}

export function assetpackPlugin() {
  const apConfig = {
    entry: "./projects",
    pipes: [
      ...pixiPipes({
        cacheBust: false,
        compression: false,
        resolutions: { default: 1 },
        manifest: {
          output: "./src/manifest.json",
        },
      }),
    ],
  } as AssetPackConfig;
  let ap: AssetPack | undefined;

  return {
    name: "vite-plugin-assetpack",
    configResolved(resolvedConfig) {
      if (!resolvedConfig.publicDir) return;
      if (apConfig.output) return;
      const publicDir = resolvedConfig.publicDir.replace(process.cwd(), "");
      if (process.platform === "win32") {
        apConfig.output = `${publicDir}/assets/`;
      } else {
        apConfig.output = `.${publicDir}/assets/`;
      }
    },
    buildStart: async () => {
      if (ap) return;
      if (apConfig.output) {
        const dest = apConfig.output.startsWith(".")
          ? path.resolve(apConfig.output)
          : apConfig.output;
        console.log("  fast-copy projects/ →", dest);
        fastCopy("projects", dest);
        generateManifest("projects");
        console.log("  manifest written to src/manifest.json");
      }
      if (process.env.VITE_USER_NODE_ENV !== "production") return;
      ap = new AssetPack(apConfig);
      await ap.run();
    },
    buildEnd: async () => {
      if (ap) {
        await ap.stop();
        ap = undefined;
      }
    },
  } as Plugin;
}
