/* eslint-disable @typescript-eslint/no-namespace */
import { LMStudioClient } from "@lmstudio/sdk";
import z from "zod/v3";

const LLM_MODEL = Bun.env.LLM_MODEL;
if (!LLM_MODEL) throw new Error("LLM_MODEL env var missing");

const EMBEDDING_MODEL = Bun.env.EMBEDDING_MODEL;
if (!EMBEDDING_MODEL) throw new Error("EMBEDDING_MODEL env var missing");

const client = new LMStudioClient();
const llmModel = await client.llm.model(LLM_MODEL);
const embeddingModel = await client.embedding.model(EMBEDDING_MODEL);

const MAX_TOKENS = 10_000;

export namespace LLM {
  export async function chat(systemPrompt: string, userMessage: string) {
    try {
      return await llmModel.respond(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        { maxTokens: MAX_TOKENS },
      );
    } catch (error) {
      console.error("LLM chat failed:", error);
      return null;
    }
  }

  export async function structured<T extends z.ZodTypeAny>(
    systemPrompt: string,
    userMessage: string,
    schema: T,
  ) {
    try {
      return (await llmModel.respond(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        { structured: schema, maxTokens: MAX_TOKENS },
      )) as unknown as { parsed: z.infer<T> } | null;
    } catch (error) {
      console.error("LLM structured call failed:", error);
      return null;
    }
  }

  export async function generateEmbedding(text: string): Promise<number[]> {
    const result = await embeddingModel.embed(text);
    return result.embedding;
  }
}
