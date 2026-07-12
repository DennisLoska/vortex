---
name: vortex
description: PixiJS v8 visual composition app with project-based media assets. Add new project: run `bash .opencode/skills/vortex/new-project.sh <name>`
---

# Vortex

PixiJS v8 app. Each project in `projects/<name>/` is a self-contained media composition.

## Project Structure

```
projects/<name>/
  backgrounds/       ← images (PNG/JPG/WebP) for background layer crossfade
  gifs/              ← animated GIFs for asset spawner
  assets/            ← images + videos (PNG/MP4) for random spawn pool
  texts/             ← numbered .txt files (01_intro.txt, 02_scene.txt)
```

## Add New Project

Creates file structure only — **no content files**:

```bash
template=".opencode/skills/vortex/new-project.sh"
name="my-project"
mkdir -p "projects/$name/backgrounds" "projects/$name/gifs" "projects/$name/assets" "projects/$name/texts"
echo "01_" > "projects/$name/texts/01_placeholder.txt"
echo "02_" > "projects/$name/texts/02_placeholder.txt"
echo "03_" > "projects/$name/texts/03_placeholder.txt"
```

Then populate media files into each directory. AssetPack processes them on next `npm run dev` or `npm run build`. Hotkeys 1-9 auto-discover the new project at next screen load.

## Key Architecture

- **`projects/`** — all project dirs (gitignored), processed by AssetPack into `public/assets/`
- **`projects/main{m}/`** — global UI (spritesheets, logo) — NOT per-project
- **`projects/preload{m}/`** — preload logo — NOT per-project
- **AssetPack** — `pixiPipes` with `resolutions: { default: 1 }` (no 0.5x variants)
- **Project discovery** — `CompositionScreen.ts` reads manifest, extracts unique top-level path segments
- **Switching** — key 1-9 → full reload (`hide()` → `prepare()` → `show()`)

## Key Files

| File | Role |
|------|------|
| `scripts/assetpack-vite-plugin.ts` | AssetPack Vite plugin, entry `./projects` |
| `src/app/screens/main/CompositionScreen.ts` | Screen orchestrator, project switching |
| `src/app/screens/main/composition/BackgroundLayer.ts` | Background crossfade, filters by `${project}/backgrounds/` |
| `src/app/screens/main/composition/AssetSpawner.ts` | Random spawn pool, filters by `${project}/` |
| `src/app/screens/main/composition/TextOverlay.ts` | Text overlay, loads from `/projects/${project}/texts/` |

## Common Commands

```bash
npm run dev      # dev server with AssetPack watch
npm run build    # lint + typecheck + AssetPack + Vite build
```
