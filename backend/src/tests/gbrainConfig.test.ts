import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { makeFakeClaudeDir } from "./setup.ts";

const CLAUDE = makeFakeClaudeDir();
process.env.CCP_CLAUDE_DIR = CLAUDE;

const gbrainApi = await import("../api/gbrain.ts");
const { GBRAIN_HOOKS_CONFIG } = await import("../config.ts");

describe("gbrain hooks config", () => {
  it("returns defaults when no config file exists", () => {
    expect(existsSync(GBRAIN_HOOKS_CONFIG)).toBe(false);
    const cfg = gbrainApi.getHooksConfig();
    expect(cfg).toEqual({
      recall: true,
      capture: true,
      perPromptRecall: false,
      topK: 5,
      installed: false,
    });
  });

  it("writes then reads back updated config", () => {
    const written = gbrainApi.setHooksConfig({
      recall: false,
      capture: true,
      perPromptRecall: true,
      topK: 8,
      installed: true,
    });
    expect(written.topK).toBe(8);
    expect(existsSync(GBRAIN_HOOKS_CONFIG)).toBe(true);

    const reread = gbrainApi.getHooksConfig();
    expect(reread.recall).toBe(false);
    expect(reread.perPromptRecall).toBe(true);
    expect(reread.topK).toBe(8);
    expect(reread.installed).toBe(true);

    // Persisted as valid JSON on disk.
    const onDisk: unknown = JSON.parse(readFileSync(GBRAIN_HOOKS_CONFIG, "utf8"));
    expect((onDisk as { topK: number }).topK).toBe(8);
  });

  it("backfills missing fields from defaults", () => {
    Bun.write(GBRAIN_HOOKS_CONFIG, '{"recall": false}');
    const cfg = gbrainApi.getHooksConfig();
    expect(cfg.recall).toBe(false);
    expect(cfg.capture).toBe(true); // default
    expect(cfg.topK).toBe(5); // default
  });
});
