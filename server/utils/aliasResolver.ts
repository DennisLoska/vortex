export type LayerId = "background" | "asset" | "fixed" | "status" | "webcam";
const VALID_LAYERS: LayerId[] = [
  "background",
  "asset",
  "fixed",
  "status",
  "webcam",
];

export function normalizeAlias(s: string): string {
  return s.trim();
}

function basenameNoExt(s: string): string {
  const f = s.split("/").pop() || "";
  const dot = f.lastIndexOf(".");
  return dot > -1 ? f.slice(0, dot) : f;
}

function levenshtein(a: string, b: string): number {
  const m = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = m[0];
    m[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = m[i];
      m[i] = Math.min(
        m[i] + 1,
        m[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return m[a.length];
}

export function resolveAssetAlias(
  requested: string,
  available: string[],
): { alias: string | null; suggestion: string[] } {
  const n = normalizeAlias(requested);
  if (available.includes(n)) return { alias: n, suggestion: [] };
  const low = n.toLowerCase();
  const ci = available.find((a) => a.toLowerCase() === low);
  if (ci) return { alias: ci, suggestion: [] };
  // fix <-> fixed path normalization
  const fixedPath = n.replace(/\/fixed\//g, "/fix/");
  const altPath = fixedPath.toLowerCase();
  const fixCi = available.find((a) => a.toLowerCase() === altPath);
  if (fixCi) return { alias: fixCi, suggestion: [] };
  // also try reverse: available has /fixed/ but requested has /fix/ ?
  // generally alias uses /fix/, so already handled; but handle both ways
  const revPath = n.replace(/\/fix\//g, "/fixed/");
  const revCi = available.find(
    (a) => a.toLowerCase() === revPath.toLowerCase(),
  );
  if (revCi) return { alias: revCi, suggestion: [] };

  const base = basenameNoExt(n).toLowerCase();
  // unique basename without ext
  const withoutExtMatches = available.filter(
    (a) => basenameNoExt(a).toLowerCase() === base,
  );
  if (withoutExtMatches.length === 1)
    return { alias: withoutExtMatches[0], suggestion: [] };
  if (withoutExtMatches.length > 1)
    return { alias: null, suggestion: withoutExtMatches.slice(0, 5) };

  // includes fallback (for basename only like "hearts" matching path)
  if (base.length >= 2) {
    const includes = available.filter((a) => a.toLowerCase().includes(base));
    // if unique includes with exact basename, already handled; if multiple, suggest
    if (includes.length > 0 && includes.length <= 5) {
      // if already multiple withoutExt, we already returned; this is for partial
      if (withoutExtMatches.length === 0) {
        // if single include and basename matches partially, treat as resolved if unambiguous basename
        // but for safety, if single include, resolve
        if (includes.length === 1)
          return { alias: includes[0], suggestion: [] };
        return { alias: null, suggestion: includes.slice(0, 5) };
      }
    }
  }

  // no match: return top suggestions
  return { alias: null, suggestion: available.slice(0, 5) };
}

export function resolveFilterPreset(
  requested: string,
  presets: string[],
): { preset: string | null; suggestion: string[] } {
  const n = requested.trim();
  const ci = presets.find((p) => p.toLowerCase() === n.toLowerCase());
  if (ci) return { preset: ci, suggestion: [] };
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[-_\s]+/g, "")
      .replace("grey", "gray");
  const nn = norm(n);
  const found = presets.find((p) => norm(p) === nn);
  if (found) return { preset: found, suggestion: [] };
  if (nn === "gray" || nn === "grayscale") {
    const g = presets.find((p) => p === "Grayscale");
    if (g) return { preset: g, suggestion: [] };
  }
  // alias for common typos
  const scored = presets
    .map((p) => ({ p, d: levenshtein(nn, norm(p)) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0];
  if (best && best.d <= 2)
    return {
      preset: null,
      suggestion: [best.p, ...scored.slice(1, 2).map((s) => s.p)],
    };
  return { preset: null, suggestion: presets.slice(0, 5) };
}

export function resolveLayer(requested: string): {
  layer: LayerId | null;
  suggestion: LayerId[];
} {
  const n = requested.trim().toLowerCase();
  if (n === "fix") return { layer: "fixed", suggestion: [] };
  if (n === "backgrounds") return { layer: "background", suggestion: [] };
  const found = VALID_LAYERS.find((v) => v === n);
  if (found) return { layer: found as LayerId, suggestion: [] };
  return { layer: null, suggestion: [...VALID_LAYERS] };
}

export function clampCoord(v: number, bound: number): number {
  return Math.max(0, Math.min(bound, v));
}
export function clampScale(s: number): number {
  return Math.max(0.1, Math.min(2, s));
}
export function clampIntensity(p: number): number {
  return Math.max(0, Math.min(100, p));
}
