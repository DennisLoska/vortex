/* eslint-disable @typescript-eslint/no-namespace */
import { ChromaClient, type Collection } from "chromadb";
import { LLM } from "./llm";

const COLLECTION_NAME = Bun.env.CHROMADB_COLLECTION || "vortex_assets";

export type AssetMeta = {
  id: string;
  project: string;
  path: string;
  type: string;
  filename: string;
};

export namespace Chroma {
  let client: ChromaClient;
  let collection: Collection;

  async function init() {
    const url = Bun.env.CHROMADB_URL || "http://localhost:8000";
    const parsed = new URL(url);
    client = new ChromaClient({
      host: parsed.hostname,
      port: Number(parsed.port || 8000),
      ssl: parsed.protocol === "https:",
    });
    try {
      await client.heartbeat();
    } catch (e) {
      console.error("ChromaDB healthcheck failed — is the server running?", e);
      process.exit(1);
    }
    collection = await client.getOrCreateCollection({ name: COLLECTION_NAME });
    console.log(`ChromaDB ready: ${COLLECTION_NAME}`);
  }

  function isReady() {
    return !!(client && collection);
  }

  export async function exists(id: string): Promise<boolean> {
    if (!isReady()) await init();
    const result = await collection.get({ ids: [id] });
    return result.ids.length > 0;
  }

  export async function saveAsset(meta: AssetMeta) {
    if (!isReady()) await init();
    const document = `${meta.filename}. Type: ${meta.type}. Project: ${meta.project}. Path: ${meta.path}`;
    const embedding = await LLM.generateEmbedding(document);
    await collection.upsert({
      ids: [meta.id],
      embeddings: [embedding],
      metadatas: [
        {
          project: meta.project,
          path: meta.path,
          type: meta.type,
          filename: meta.filename,
        },
      ],
      documents: [document],
    });
  }

  export async function searchAssets(
    query: string,
    project: string,
    limit = 10,
  ) {
    if (!isReady()) await init();
    const embedding = await LLM.generateEmbedding(query);
    const results = await collection.query({
      queryEmbeddings: [embedding],
      nResults: limit,
      where: { project: { $eq: project } },
    });
    return (results.ids[0] || []).map((id, i) => ({
      id,
      path: (results.metadatas?.[0]?.[i]?.path as string) || "",
      project: (results.metadatas?.[0]?.[i]?.project as string) || "",
      type: (results.metadatas?.[0]?.[i]?.type as string) || "",
      filename: (results.metadatas?.[0]?.[i]?.filename as string) || "",
      score: results.distances?.[0]?.[i] ?? 0,
    }));
  }
}
