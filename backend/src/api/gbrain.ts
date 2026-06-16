/**
 * /api/gbrain — status, search, recent, sync, and hooks-config toggles.
 * Every call degrades gracefully if the gbrain CLI is missing or unhealthy.
 */
import {
  countWarnings,
  embedderFromDoctor,
  isFunctional,
  pagesFromDoctor,
  parseDoctorJson,
  parseListRows,
  parseQueryRows,
  parseVersion,
  runGbrain,
} from "../lib/gbrain.ts";
import { readHooksConfig, writeHooksConfig } from "../lib/gbrainConfig.ts";
import {
  GbrainHooksConfig,
  GbrainRecentResponse,
  GbrainSearchResponse,
  GbrainStatus,
  OkResponse,
} from "../../../shared/contracts.ts";

const MISSING_HINT =
  "gbrain CLI not reachable. Install it (see setup-gbrain) and ensure it's on PATH.";

export async function status(): Promise<GbrainStatus> {
  const [ver, doctor] = await Promise.all([
    runGbrain(["--version"], 10_000),
    runGbrain(["doctor", "--json"], 60_000),
  ]);

  if (!ver.ok && !doctor.ok && !ver.stdout && !doctor.stdout) {
    return GbrainStatus.parse({
      ok: false,
      version: "",
      engine: "",
      embedder: "",
      pages: 0,
      chunks: 0,
      hint: MISSING_HINT,
    });
  }

  const version = parseVersion(ver.stdout);
  const doc = parseDoctorJson(doctor.stdout);
  if (!doc) {
    return GbrainStatus.parse({
      ok: false,
      version,
      engine: "",
      embedder: "",
      pages: 0,
      chunks: 0,
      hint: "gbrain doctor returned no parseable status. Run `gbrain doctor`.",
    });
  }

  // The brain is usable when it's connected + embeddings exist, even if the
  // doctor's aggregate verdict is "unhealthy" due to advisory WARNs.
  const functional = isFunctional(doc);
  const warnings = countWarnings(doc);
  const pages = pagesFromDoctor(doc);
  const embedder = embedderFromDoctor(doc);
  const hint = functional
    ? warnings > 0
      ? `Connected · ${pages} pages · embeddings OK. ${warnings} advisory warning(s) — run \`gbrain doctor\`.`
      : ""
    : `Brain not reachable (${doc.status ?? "unknown"}). Run \`gbrain doctor\` for details.`;

  return GbrainStatus.parse({
    ok: functional,
    version,
    engine: "pglite",
    embedder,
    pages,
    // chunk count isn't exposed by doctor JSON; report 0 rather than guess.
    chunks: 0,
    hint,
  });
}

export async function search(query: string): Promise<GbrainSearchResponse> {
  const q = query.trim();
  if (!q) return GbrainSearchResponse.parse({ query: q, results: [] });

  // Keyword search (tsvector, ~1s) for a responsive search box. Semantic
  // `gbrain query` runs ollama embeddings (~60s) — too slow for interactive use.
  const res = await runGbrain(["search", q], 15_000);
  const results = parseQueryRows(res.stdout).map((r) => ({
    slug: r.slug,
    title: r.title,
    snippet: r.snippet,
    score: r.score,
    type: r.type,
  }));
  return GbrainSearchResponse.parse({ query: q, results });
}

export async function recent(): Promise<GbrainRecentResponse> {
  const res = await runGbrain(["list", "--limit", "20"], 45_000);
  const items = parseListRows(res.stdout).map((r) => ({
    slug: r.slug,
    title: r.title,
    when: r.when,
  }));
  return GbrainRecentResponse.parse({ items });
}

export async function sync(): Promise<OkResponse> {
  const res = await runGbrain(["sync"], 120_000);
  return OkResponse.parse({ ok: res.ok });
}

export function getHooksConfig(): GbrainHooksConfig {
  return GbrainHooksConfig.parse(readHooksConfig());
}

export function setHooksConfig(req: GbrainHooksConfig): GbrainHooksConfig {
  return GbrainHooksConfig.parse(writeHooksConfig(req));
}
