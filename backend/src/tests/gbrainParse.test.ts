import { describe, expect, it } from "bun:test";
import {
  embedderFromDoctor,
  pagesFromDoctor,
  parseDoctorJson,
  parseListRows,
  parseQueryRows,
  parseVersion,
} from "../lib/gbrain.ts";

describe("gbrain output parsing", () => {
  it("extracts the JSON object from noisy doctor stdout", () => {
    const stdout = [
      "[doctor.db_checks] start",
      "[doctor.db_checks] connection",
      '{"status":"warnings","health_score":95,"checks":[{"name":"connection","status":"ok","message":"Connected, 222 pages"},{"name":"embedding_provider","status":"ok","message":"ollama:nomic-embed-text ✓ 1202ms, 768 dims"}]}',
    ].join("\n");
    const doc = parseDoctorJson(stdout);
    expect(doc).not.toBeNull();
    expect(pagesFromDoctor(doc!)).toBe(222);
    expect(embedderFromDoctor(doc!)).toBe("ollama:nomic-embed-text");
  });

  it("parses the version line", () => {
    expect(parseVersion("gbrain 0.33.1.1")).toBe("0.33.1.1");
  });

  it("parses TSV list rows", () => {
    const rows = parseListRows(
      "timelines/foo/2026-04-15-timeline\ttimeline\t2026-05-18\ttimeline — foo",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slug).toBe("timelines/foo/2026-04-15-timeline");
    expect(rows[0]!.when).toBe("2026-05-18");
  });

  it("parses query result headers + snippets", () => {
    const stdout = [
      "[0.8640] transcripts/cc/abc -- panel",
      "  ◻ Phase 1.5 Task 4: compose pane",
      "[0.8494] transcripts/cc/def -- from GBrain",
      "  - Decision panel",
    ].join("\n");
    const rows = parseQueryRows(stdout);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.score).toBeCloseTo(0.864);
    expect(rows[0]!.slug).toBe("transcripts/cc/abc");
    expect(rows[0]!.type).toBe("transcript");
    expect(rows[0]!.snippet).toContain("compose pane");
  });
});
