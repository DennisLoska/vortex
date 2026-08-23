/* eslint-disable @typescript-eslint/no-namespace */
import { LMStudioClient } from "@lmstudio/sdk";
import { createOpencodeClient } from "@opencode-ai/sdk";
import z from "zod/v3";
import { join } from "node:path";
import { getVortexModel } from "../config";

const ROOT = join(import.meta.dir, "../..");

// --- Embedding (LM Studio, kept for Chroma) ---
let embeddingModel: Awaited<
  ReturnType<LMStudioClient["embedding"]["model"]>
> | null = null;
const lmClient = new LMStudioClient();

async function getEmbeddingModelInst() {
  if (!embeddingModel) {
    const name = Bun.env.EMBEDDING_MODEL || "text-embedding-qwen3-embedding-8b";
    embeddingModel = await lmClient.embedding.model(name);
  }
  return embeddingModel;
}

// --- Chat via opencode server ---
function parseModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/");
  if (slash === -1) return { providerID: "opencode", modelID: model };
  return { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) };
}

function getOpencodeClient() {
  const baseUrl = Bun.env.OPENCODE_URL || "http://localhost:4096";
  const username = Bun.env.OPENCODE_SERVER_USERNAME || "opencode";
  const password = Bun.env.OPENCODE_SERVER_PASSWORD || "";
  const headers: Record<string, string> = {};
  if (password) {
    headers["Authorization"] = `Basic ${btoa(`${username}:${password}`)}`;
  }
  return createOpencodeClient({ baseUrl, headers } as unknown as Parameters<
    typeof createOpencodeClient
  >[0]);
}

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return text.slice(first, last + 1);
  }
  return text.trim();
}

export namespace LLM {
  export async function chat(systemPrompt: string, userMessage: string) {
    try {
      const client = getOpencodeClient();
      const vortexModel = getVortexModel();
      const { providerID, modelID } = parseModel(vortexModel);
      const sessionRes = await client.session.create({
        body: { title: "vortex-chat" },
        query: { directory: ROOT },
      });
      const session = (sessionRes as unknown as { data: { id: string } }).data;
      if (!session?.id) throw new Error("failed to create opencode session");
      const res = await client.session.prompt({
        path: { id: session.id },
        body: {
          model: { providerID, modelID },
          parts: [
            { type: "text", text: `${systemPrompt}\n\n---\n\n${userMessage}` },
          ],
        },
      });
      const data = (
        res as unknown as {
          data: { parts: Array<{ type: string; text?: string }> };
        }
      ).data;
      const text =
        data.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") || "";
      return { content: text } as unknown as { parsed: unknown };
    } catch (error) {
      console.error("LLM chat (opencode) failed:", error);
      return null;
    }
  }

  export async function structured<T extends z.ZodTypeAny>(
    systemPrompt: string,
    userMessage: string,
    schema: T,
  ) {
    try {
      const client = getOpencodeClient();
      const vortexModel = getVortexModel();
      const { providerID, modelID } = parseModel(vortexModel);
      const sessionRes = await client.session.create({
        body: { title: "vortex-structured" },
        query: { directory: ROOT },
      });
      const session = (sessionRes as unknown as { data: { id: string } }).data;
      if (!session?.id) throw new Error("failed to create opencode session");

      const schemaHint = `You MUST respond with ONLY valid JSON matching the expected schema. No markdown, no explanation outside JSON.`;
      const fullUser = `${userMessage}\n\n${schemaHint}`;

      const res = await client.session.prompt({
        path: { id: session.id },
        body: {
          model: { providerID, modelID },
          parts: [
            { type: "text", text: `${systemPrompt}\n\n---\n\n${fullUser}` },
          ],
        },
      });
      const data = (
        res as unknown as {
          data: { parts: Array<{ type: string; text?: string }> };
        }
      ).data;
      const rawText =
        data.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") || "";
      if (!rawText) return null;
      const jsonStr = extractJson(rawText);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(jsonStr);
      } catch (e) {
        console.error(
          "LLM structured: JSON parse failed:",
          rawText.slice(0, 500),
          e,
        );
        return null;
      }
      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        console.error(
          "LLM structured: zod validation failed:",
          validated.error.issues,
          "raw:",
          jsonStr.slice(0, 1000),
        );
        return null;
      }
      return { parsed: validated.data as z.infer<T> } as unknown as {
        parsed: z.infer<T>;
      };
    } catch (error) {
      console.error("LLM structured (opencode) failed:", error);
      return null;
    }
  }

  export async function generateEmbedding(text: string): Promise<number[]> {
    const model = await getEmbeddingModelInst();
    const result = await model.embed(text);
    return result.embedding;
  }
}
