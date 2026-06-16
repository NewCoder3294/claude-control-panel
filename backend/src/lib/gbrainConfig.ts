/**
 * Read/write the gbrain hooks toggle file (~/.claude/gbrain-hooks.json). This
 * is the file the recall/capture hook scripts read on each run, so the panel
 * can flip behavior without editing settings.json. No HTTP knowledge.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GBRAIN_HOOKS_CONFIG } from "../config.ts";
import type { GbrainHooksConfig } from "../../../shared/contracts.ts";

export const GBRAIN_HOOKS_DEFAULTS: GbrainHooksConfig = {
  recall: true,
  capture: true,
  perPromptRecall: false,
  topK: 5,
  installed: false,
};

function coerceBool(x: unknown, fallback: boolean): boolean {
  return typeof x === "boolean" ? x : fallback;
}
function coerceNum(x: unknown, fallback: number): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

/** Read the hooks config, falling back to defaults for any missing field. */
export function readHooksConfig(): GbrainHooksConfig {
  if (!existsSync(GBRAIN_HOOKS_CONFIG)) return { ...GBRAIN_HOOKS_DEFAULTS };
  try {
    const parsed: unknown = JSON.parse(readFileSync(GBRAIN_HOOKS_CONFIG, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return { ...GBRAIN_HOOKS_DEFAULTS };
    }
    const o = parsed as Record<string, unknown>;
    return {
      recall: coerceBool(o.recall, GBRAIN_HOOKS_DEFAULTS.recall),
      capture: coerceBool(o.capture, GBRAIN_HOOKS_DEFAULTS.capture),
      perPromptRecall: coerceBool(
        o.perPromptRecall,
        GBRAIN_HOOKS_DEFAULTS.perPromptRecall,
      ),
      topK: coerceNum(o.topK, GBRAIN_HOOKS_DEFAULTS.topK),
      installed: coerceBool(o.installed, GBRAIN_HOOKS_DEFAULTS.installed),
    };
  } catch {
    return { ...GBRAIN_HOOKS_DEFAULTS };
  }
}

/**
 * Persist the hooks config, creating the parent dir if needed. Unknown fields
 * already on disk (e.g. minCaptureMessages used by the hook scripts) are
 * preserved — the panel only owns the contract's fields.
 */
export function writeHooksConfig(config: GbrainHooksConfig): GbrainHooksConfig {
  mkdirSync(dirname(GBRAIN_HOOKS_CONFIG), { recursive: true });

  let merged: Record<string, unknown> = { ...config };
  if (existsSync(GBRAIN_HOOKS_CONFIG)) {
    try {
      const existing: unknown = JSON.parse(
        readFileSync(GBRAIN_HOOKS_CONFIG, "utf8"),
      );
      if (typeof existing === "object" && existing !== null) {
        merged = { ...(existing as Record<string, unknown>), ...config };
      }
    } catch {
      // unreadable/invalid — overwrite with just the contract fields
    }
  }

  writeFileSync(
    GBRAIN_HOOKS_CONFIG,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8",
  );
  return config;
}
