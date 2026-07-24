import { z } from "zod/v3";
import { LLM } from "../services/llm";
import { Chroma } from "../services/chroma";
import { buildSystemPrompt } from "../system-prompt";
import type { ChatRequest, AgentResponse } from "../types";
import { readdir } from "node:fs/promises";
import { join, extname } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../projects");
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);
const VIDEO_EXTS = new Set([".mp4", ".webm", ".m4v", ".ogv", ".mov"]);
const GIF_EXT = ".gif";

const actionSchema = z.object({
  type: z.string(),
  alias: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  layer: z.string().optional(),
  preset: z.string().optional(),
  intensity: z.number().optional(),
  visible: z.boolean().optional(),
  index: z.number().optional(),
  name: z.string().optional(),
  nameOrIndex: z.union([z.string(), z.number()]).optional(),
  query: z.string().optional(),
  language: z.enum(["EN", "DE"]).optional(),
  scale: z.number().optional(),
});

const responseSchema = z.object({
  actions: z.array(actionSchema),
  explanation: z.string(),
});

async function getProjectAssets(project: string) {
  const assets: { alias: string; type: string }[] = [];
  const dir = join(PROJECTS_DIR, project, "assets");
  try {
    const files = await readdir(dir);
    for (const file of files) {
      const ext = extname(file).toLowerCase();
      let type = "image";
      if (VIDEO_EXTS.has(ext)) type = "video";
      else if (ext === GIF_EXT) type = "gif";
      else if (!IMAGE_EXTS.has(ext)) continue;
      assets.push({ alias: `${project}/assets/${file}`, type });
    }
  } catch {
    /* dir missing */
  }
  return assets;
}

async function getProjectBackgrounds(project: string) {
  const bgs: string[] = [];
  const dir = join(PROJECTS_DIR, project, "backgrounds");
  try {
    const files = await readdir(dir);
    for (const file of files) {
      bgs.push(`${project}/backgrounds/${file}`);
    }
  } catch {
    /* dir missing */
  }
  return bgs;
}

export async function handleChat(req: Request): Promise<Response> {
  const body = (await req.json()) as ChatRequest;
  const { message, project, state } = body;

  if (!message || !project) {
    return Response.json(
      { error: "message and project required" },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9-]+$/.test(project)) {
    return Response.json({ error: "Invalid project name" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        send("thinking", { status: "Building context..." });

        const assets = await getProjectAssets(project);
        const backgrounds = await getProjectBackgrounds(project);
        const filterPresets = [
          "None",
          "Grayscale",
          "Sepia",
          "Vintage",
          "Kodachrome",
          "Polaroid",
          "Negative",
          "Technicolor",
          "Predator",
          "LSD",
          "Bright",
          "Contrast",
          "Night",
          "Blur Light",
          "Blur Heavy",
          "Noise Light",
          "Noise Heavy",
          "Alpha 50%",
          "Glow",
          "Bloom",
          "Drop Shadow",
          "Outline",
          "Pixelate",
          "RGB Split",
          "CRT",
          "Emboss",
          "Motion Blur",
          "Glitch",
          "Godray",
          "Bevel",
          "Cross Hatch",
          "Old Film",
          "ASCII",
          "Reflection",
          "Tilt Shift",
          "Zoom Blur",
          "Adjustment",
        ];

        const systemPrompt = buildSystemPrompt(
          project,
          assets,
          backgrounds,
          filterPresets,
          state,
        );

        send("thinking", { status: "Calling LLM..." });

        // Check if agent wants to search assets first
        const searchCheck = await LLM.structured(
          "You are a query analyzer. Determine if the user request requires searching for assets semantically. Return { needsSearch: boolean, searchQuery?: string }",
          message,
          z.object({
            needsSearch: z.boolean(),
            searchQuery: z.string().optional(),
          }),
        );

        let searchResults: string | null = null;
        if (
          searchCheck?.parsed?.needsSearch &&
          searchCheck.parsed.searchQuery
        ) {
          send("thinking", {
            status: `Searching assets: ${searchCheck.parsed.searchQuery}`,
          });
          const results = await Chroma.searchAssets(
            searchCheck.parsed.searchQuery,
            project,
          );
          searchResults = results
            .map((r) => `- ${r.id} (score: ${r.score.toFixed(3)})`)
            .join("\n");
        }

        const userMsg = searchResults
          ? `${message}\n\nSemantic asset search results:\n${searchResults}`
          : message;

        send("thinking", { status: "Generating actions..." });

        const result = await LLM.structured(
          systemPrompt,
          userMsg,
          responseSchema,
        );

        if (!result?.parsed) {
          send("error", { error: "LLM returned no valid response" });
          controller.close();
          return;
        }

        // Validate actions against project
        const validActions = result.parsed.actions.filter((action) => {
          if (!action.type || typeof action.type !== "string") return false;
          if (action.alias && typeof action.alias === "string") {
            if (!action.alias.startsWith(`${project}/`)) return false;
          }
          if (action.type === "placeAsset" || action.type === "removeAsset") {
            if (action.layer !== "asset" && action.layer !== "fixed")
              return false;
          }
          return true;
        });

        const response: AgentResponse = {
          actions: validActions as AgentResponse["actions"],
          explanation: result.parsed.explanation,
        };

        send("actions", response);
        send("done", {});
      } catch (error) {
        send("error", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
