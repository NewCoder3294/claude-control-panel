/**
 * Spawn the `gbrain` CLI and parse its (mostly non-JSON) output defensively.
 * Never throws — every call degrades gracefully so the panel keeps working
 * when the brain is absent, misconfigured, or slow. No HTTP knowledge.
 *
 * Observed CLI shapes (gbrain 0.33.x):
 *  - `gbrain --version`           -> "gbrain 0.33.1.1"
 *  - `gbrain doctor --json`       -> noisy log lines, then ONE JSON object on a
 *                                    line: {status, health_score, checks:[{name,status,message}]}
 *                                    `connection` message "Connected, 222 pages";
 *                                    `embedding_provider` message holds the embedder.
 *  - `gbrain list --limit N`      -> TSV rows: slug<TAB>type<TAB>date<TAB>title
 *  - `gbrain query <q> --limit N` -> "[0.86] <slug> -- <title>" + indented snippet lines
 */

export interface CliOut {
  ok: boolean;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 45_000;

/** Run a gbrain subcommand with a hard timeout. Never throws. */
export async function runGbrain(
  args: string[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CliOut> {
  try {
    const proc = Bun.spawn(["gbrain", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // already exited
      }
    }, timeoutMs);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    clearTimeout(timer);
    return { ok: code === 0, stdout, stderr };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, stdout: "", stderr: message };
  }
}

export interface DoctorCheck {
  name: string;
  status: string;
  message: string;
}
export interface DoctorJson {
  status?: string;
  health_score?: number;
  checks?: DoctorCheck[];
}

/** Pull the last well-formed JSON object out of noisy doctor stdout. */
export function parseDoctorJson(stdout: string): DoctorJson | null {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line || !line.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as DoctorJson;
      }
    } catch {
      // not the JSON line — keep scanning upward
    }
  }
  return null;
}

export function findCheck(doc: DoctorJson, name: string): DoctorCheck | undefined {
  return doc.checks?.find((c) => c.name === name);
}

/** A check counts as passing unless it explicitly failed/errored. WARN is fine. */
export function checkPasses(doc: DoctorJson, name: string): boolean {
  const c = findCheck(doc, name);
  if (!c) return false;
  return /^(ok|pass|healthy|warn)/i.test(c.status);
}

/**
 * The brain is FUNCTIONAL (recall/search work) when it's connected and
 * embeddings are present — regardless of the doctor's aggregate verdict, which
 * drops to "unhealthy" on advisory WARNs (brain_score, missing eval fixtures).
 */
export function isFunctional(doc: DoctorJson): boolean {
  const connected = /^(ok|pass|healthy|warn)/i.test(
    findCheck(doc, "connection")?.status ?? "",
  );
  const embeds = checkPasses(doc, "embeddings");
  return connected && embeds;
}

/** Count advisory warnings to surface as a note (not a failure). */
export function countWarnings(doc: DoctorJson): number {
  return (doc.checks ?? []).filter((c) => /^warn/i.test(c.status)).length;
}

/** Extract a page count from the connection check ("Connected, 222 pages"). */
export function pagesFromDoctor(doc: DoctorJson): number {
  const conn = findCheck(doc, "connection");
  const m = conn?.message.match(/(\d[\d,]*)\s+pages/);
  if (!m || m[1] === undefined) return 0;
  return Number(m[1].replace(/,/g, ""));
}

/** Extract embedder name from the embedding_provider check. */
export function embedderFromDoctor(doc: DoctorJson): string {
  const ep = findCheck(doc, "embedding_provider");
  if (!ep) return "";
  // e.g. "ollama:nomic-embed-text ✓ 1202ms, 768 dims, DB aligned"
  const m = ep.message.match(/^([^\s✓,]+)/);
  return m?.[1] ?? "";
}

/** Parse `gbrain --version` -> "0.33.1.1". */
export function parseVersion(stdout: string): string {
  const m = stdout.trim().match(/gbrain\s+([0-9][^\s]*)/i);
  return m?.[1] ?? stdout.trim();
}

export interface RecentRow {
  slug: string;
  title: string;
  when: string;
}

/** Parse `gbrain list` TSV rows: slug<TAB>type<TAB>date<TAB>title. */
export function parseListRows(stdout: string): RecentRow[] {
  const out: RecentRow[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes("\t")) continue;
    const parts = line.split("\t");
    const slug = (parts[0] ?? "").trim();
    if (!slug || slug.startsWith("[")) continue;
    const when = (parts[2] ?? "").trim();
    const title = (parts[3] ?? parts[0] ?? "").trim();
    out.push({ slug, title, when });
  }
  return out;
}

export interface QueryRow {
  slug: string;
  title: string;
  snippet: string;
  score: number;
  type: string;
}

/** Derive a coarse page type from a slug's leading path segment. */
function typeFromSlug(slug: string): string {
  const head = slug.split("/")[0] ?? "";
  return head.replace(/s$/, ""); // "transcripts" -> "transcript"
}

/**
 * Parse `gbrain query` text output. Result headers look like:
 *   "[0.8640] transcripts/foo/bar -- panel"
 * followed by indented snippet lines until the next header.
 */
export function parseQueryRows(stdout: string): QueryRow[] {
  const rows: QueryRow[] = [];
  const headerRe = /^\[([0-9.]+)\]\s+(\S+)\s+--\s+(.*)$/;
  let current: QueryRow | null = null;
  let snippetParts: string[] = [];

  const flush = (): void => {
    if (current) {
      current.snippet = snippetParts.join(" ").replace(/\s+/g, " ").trim();
      rows.push(current);
    }
  };

  for (const line of stdout.split("\n")) {
    const m = line.match(headerRe);
    if (m && m[2] !== undefined) {
      flush();
      snippetParts = [];
      const slug = m[2];
      current = {
        slug,
        title: (m[3] ?? "").trim(),
        snippet: "",
        score: Number(m[1] ?? "0"),
        type: typeFromSlug(slug),
      };
    } else if (current) {
      const text = line.trim().replace(/^[◻◼·\-*]+\s*/, "");
      if (text) snippetParts.push(text);
    }
  }
  flush();
  return rows;
}
