/**
 * Minimal YAML frontmatter parsing/composition for agent + skill markdown.
 * Deliberately tiny: scalar `key: value` pairs only (no nesting/lists), which
 * is all Claude Code agent frontmatter uses. No HTTP knowledge.
 */

export interface ParsedDoc {
  /** Scalar frontmatter fields (string values, quotes stripped). */
  fields: Record<string, string>;
  /** Everything after the closing `---`, or the whole text if no frontmatter. */
  body: string;
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Parse a markdown doc with optional `---` YAML frontmatter at the top. */
export function parseFrontmatter(text: string): ParsedDoc {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match || match[1] === undefined) {
    return { fields: {}, body: text };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m || m[1] === undefined) continue;
    fields[m[1]] = stripQuotes(m[2] ?? "");
  }
  return { fields, body: match[2] ?? "" };
}

/**
 * Compose a frontmatter block from ordered key/value pairs (empty values are
 * skipped) plus a markdown body. Values containing `:` or `#` are quoted.
 */
export function composeFrontmatter(
  pairs: ReadonlyArray<[string, string]>,
  body: string,
): string {
  const lines: string[] = ["---"];
  for (const [key, raw] of pairs) {
    const value = raw.trim();
    if (value === "") continue;
    const needsQuote = /[:#]/.test(value) && !/^["']/.test(value);
    lines.push(`${key}: ${needsQuote ? JSON.stringify(value) : value}`);
  }
  lines.push("---");
  const trimmedBody = body.replace(/^\n+/, "");
  return lines.join("\n") + "\n" + (trimmedBody ? trimmedBody : "") + "\n";
}
