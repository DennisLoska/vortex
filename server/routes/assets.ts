import { Chroma } from "../services/chroma";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../projects");

export async function handleAssetSearch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const project = url.searchParams.get("project");
  const limit = Number(url.searchParams.get("limit") || "10");

  if (!q || !project) {
    return Response.json(
      { error: "q and project params required" },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9-]+$/.test(project)) {
    return Response.json({ error: "Invalid project name" }, { status: 400 });
  }

  try {
    const results = await Chroma.searchAssets(q, project, limit);
    return Response.json({ results });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function handleAssetList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const project = url.searchParams.get("project");

  if (!project) {
    return Response.json({ error: "project param required" }, { status: 400 });
  }

  if (!/^[a-z0-9-]+$/.test(project)) {
    return Response.json({ error: "Invalid project name" }, { status: 400 });
  }

  const assets: { alias: string; type: string }[] = [];
  const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
  const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);

  for (const subdir of ["assets", "fix", "backgrounds"]) {
    const dir = join(PROJECTS_DIR, project, subdir);
    try {
      const files = await readdir(dir);
      for (const file of files) {
        const ext = extname(file).toLowerCase();
        let type = "image";
        if (VIDEO_EXTS.has(ext)) type = "video";
        else if (ext === ".gif") type = "gif";
        else if (!IMAGE_EXTS.has(ext)) continue;
        assets.push({ alias: `${project}/${subdir}/${file}`, type });
      }
    } catch {
      /* dir missing */
    }
  }

  return Response.json({ assets });
}
