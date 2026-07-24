import { handleChat } from "./routes/chat";
import { handleAssetSearch, handleAssetList } from "./routes/assets";
import { handleProjects } from "./routes/projects";

const PORT = Number(Bun.env.VORTEX_SERVER_PORT || 3001);

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(req);
    }
    if (req.method === "GET" && url.pathname === "/api/assets/search") {
      return handleAssetSearch(req);
    }
    if (req.method === "GET" && url.pathname === "/api/assets/list") {
      return handleAssetList(req);
    }
    if (req.method === "GET" && url.pathname === "/api/projects") {
      return handleProjects(req);
    }
    if (req.method === "POST" && url.pathname === "/api/projects") {
      return handleProjects(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Vortex server running on http://localhost:${PORT}`);
