import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PROJECTS_DIR = join(import.meta.dir, "../../projects");

export async function handleProjects(req: Request): Promise<Response> {
  if (req.method === "GET") {
    try {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      const projects = entries
        .filter(
          (e) =>
            e.isDirectory() && !e.name.includes("{") && !e.name.startsWith("."),
        )
        .map((e) => e.name);
      return Response.json({ projects });
    } catch {
      return Response.json({ projects: [] });
    }
  }

  if (req.method === "POST") {
    const body = (await req.json()) as { name: string; language: "EN" | "DE" };
    const { name, language } = body;

    if (!name || !language) {
      return Response.json(
        { error: "name and language required" },
        { status: 400 },
      );
    }

    if (!/^[a-z0-9-]+$/.test(name)) {
      return Response.json(
        { error: "name must be lowercase alphanumeric with hyphens" },
        { status: 400 },
      );
    }

    const projectDir = join(PROJECTS_DIR, name);

    try {
      await mkdir(join(projectDir, "backgrounds"), { recursive: true });
      await mkdir(join(projectDir, "assets"), { recursive: true });
      await mkdir(join(projectDir, "texts"), { recursive: true });

      await writeFile(
        join(projectDir, "project.json"),
        JSON.stringify({ language }, null, 2) + "\n",
      );

      await writeFile(
        join(projectDir, "texts", "01_welcome.txt"),
        `Welcome to ${name}.\n`,
      );
      await writeFile(
        join(projectDir, "texts", "02_reflection.txt"),
        "A space for creativity.\n",
      );
      await writeFile(
        join(projectDir, "texts", "03_invitation.txt"),
        "Explore and enjoy.\n",
      );

      return Response.json({ success: true, path: `projects/${name}` });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
}
