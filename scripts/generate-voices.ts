import * as fs from "node:fs";
import * as path from "node:path";

type VoiceboxGenerateResponse = {
  id: string;
  duration?: number;
};

type VoiceboxProfile = {
  id: string;
  name: string;
  language: string;
};

const VOICEBOX_URL = process.env.VOICEBOX_URL;
if (!VOICEBOX_URL) {
  console.error("Missing VOICEBOX_URL in .env");
  process.exit(1);
}

const VOICE_NAME_EN = (process.env.VOICE_ID_EN || "the_narrator_en").toLowerCase();
const VOICE_NAME_DE = (process.env.VOICE_ID_DE || "the_narrator_de").toLowerCase();

const PROJECTS_DIR = path.resolve(import.meta.dirname, "..", "projects");

const GERMAN_WORDS = new Set([
  "der", "die", "das", "und", "ist", "sind", "ein", "eine", "nicht",
  "sich", "auch", "auf", "für", "mit", "als", "bei", "nach", "aus",
  "dass", "diese", "durch", "über", "vor", "zwischen", "oder", "aber",
  "denn", "zum", "zur", "vom", "beim", "wird", "werden", "hat",
  "haben", "hast", "sehr", "wie", "immer", "noch", "schon", "hier",
  "dort", "dann", "davon", "damit", "dazu", "bereits", "einfach",
]);

function detectLanguage(text: string): "de" | "en" {
  const lower = text.toLowerCase();

  // German-specific characters strongly indicate German
  if (/[äöüß]/.test(lower)) return "de";

  // Count German vs English word matches
  const words = lower.split(/[^a-zäöüß]+/).filter(Boolean);
  let germanScore = 0;

  for (const word of words) {
    if (GERMAN_WORDS.has(word)) germanScore++;
  }

  return germanScore >= 2 ? "de" : "en";
}

async function resolveProfileId(name: string): Promise<string> {
  const res = await fetch(`${VOICEBOX_URL}/profiles`);
  if (!res.ok) throw new Error(`Failed to list profiles: ${res.status}`);
  const profiles = (await res.json()) as VoiceboxProfile[];
  const match = profiles.find((p) => p.name.toLowerCase() === name);
  if (!match) throw new Error(`Profile "${name}" not found on Voicebox`);
  return match.id;
}

async function generateVoice(
  text: string,
  profileId: string,
  language: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`${VOICEBOX_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile_id: profileId,
      text,
      language,
    }),
  });

  if (!res.ok) {
    throw new Error(`Voicebox generate failed: ${res.status} ${res.statusText}`);
  }

  const gen = (await res.json()) as VoiceboxGenerateResponse;

  // Poll until audio ready
  for (let i = 0; i < 120; i++) {
    const audioRes = await fetch(`${VOICEBOX_URL}/audio/${gen.id}`);
    if (audioRes.ok) {
      const blob = await audioRes.blob();
      if (blob.size > 100) return blob.arrayBuffer();
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Voicebox audio not ready after 120s (gen: ${gen.id})`);
}

const REGENERATE = process.argv.includes("--regenerate");

async function main() {
  const projects = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const profileIdEN = await resolveProfileId(VOICE_NAME_EN);
  const profileIdDE = await resolveProfileId(VOICE_NAME_DE);

  let total = 0;
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const project of projects) {
    const textsDir = path.join(PROJECTS_DIR, project, "texts");
    const voicesDir = path.join(PROJECTS_DIR, project, "voices");

    if (!fs.existsSync(textsDir)) continue;

    if (!fs.existsSync(voicesDir)) {
      fs.mkdirSync(voicesDir, { recursive: true });
    }

    const textFiles = fs.readdirSync(textsDir)
      .filter((f) => f.endsWith(".txt"))
      .sort();

    for (const textFile of textFiles) {
      total++;
      const stem = path.parse(textFile).name;
      const prefix = stem.split("_")[0];
      const existingVoiceFiles = fs.readdirSync(voicesDir)
        .filter((f) => f.startsWith(prefix));

      if (existingVoiceFiles.length > 0 && !REGENERATE) {
        skipped++;
        continue;
      }

      if (REGENERATE && existingVoiceFiles.length > 0) {
        for (const f of existingVoiceFiles) {
          fs.unlinkSync(path.join(voicesDir, f));
        }
      }

      const textContent = fs.readFileSync(path.join(textsDir, textFile), "utf-8").trim();
      if (!textContent) {
        console.warn(`  [SKIP] ${project}/${textFile} — empty`);
        skipped++;
        continue;
      }

      const lang = detectLanguage(textContent);
      const profileId = lang === "de" ? profileIdDE : profileIdEN;
      const outFile = path.join(voicesDir, `${stem}.wav`);

      console.log(`  [GEN]  ${project}/${textFile} → ${stem}.wav (${lang})`);

      try {
        const audioBuf = await generateVoice(textContent, profileId, lang);
        fs.writeFileSync(outFile, Buffer.from(audioBuf));
        generated++;
      } catch (err) {
        console.error(`  [ERR]  ${project}/${textFile}: ${err}`);
        errors++;
      }
    }
  }

  console.log(`\nDone. ${total} texts, ${generated} generated, ${skipped} skipped, ${errors} errors`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
