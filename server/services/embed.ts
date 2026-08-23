import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { Chroma, type AssetMeta } from "./chroma";

const PROJECTS_DIR = join(import.meta.dir, "../../projects");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);
const GIF_EXT = ".gif";

function getType(ext: string): string {
  if (IMAGE_EXTS.has(ext)) return "image";
  if (VIDEO_EXTS.has(ext)) return "video";
  if (ext === GIF_EXT) return "gif";
  return "unknown";
}

async function* walkAssets(): AsyncGenerator<AssetMeta> {
  let projects: string[];
  try {
    projects = await readdir(PROJECTS_DIR);
  } catch {
    console.warn("No projects/ directory found");
    return;
  }

  for (const project of projects) {
    if (project.includes("{") || project.startsWith(".")) continue;

    for (const subdir of ["assets", "backgrounds"]) {
      const dir = join(PROJECTS_DIR, project, subdir);
      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }

      for (const file of files) {
        const ext = extname(file).toLowerCase();
        const type = getType(ext);
        if (type === "unknown") continue;

        const path = `${subdir}/${file}`;
        const id = `${project}/${path}`;
        yield { id, project, path, type, filename: file };
      }
    }
  }
}

export async function embedAllAssets(): Promise<{
  embedded: number;
  skipped: number;
}> {
  let embedded = 0;
  let skipped = 0;

  for await (const meta of walkAssets()) {
    if (await Chroma.exists(meta.id)) {
      skipped++;
      continue;
    }
    await Chroma.saveAsset(meta);
    embedded++;
    if (embedded % 10 === 0) {
      console.log(`Embedded ${embedded} assets...`);
    }
  }

  console.log(`Embedding complete: ${embedded} new, ${skipped} existing`);
  return { embedded, skipped };
}
