/**
 * /api/settings — settings.json (+ optional settings.local.json).
 */
import { existsSync } from "node:fs";
import { SETTINGS, SETTINGS_LOCAL } from "../config.ts";
import { toConfigFile } from "../lib/fsutil.ts";
import {
  SettingsResponse,
  type ConfigFile,
} from "../../../shared/contracts.ts";

export async function settings(): Promise<SettingsResponse> {
  const main = toConfigFile({
    path: SETTINGS,
    label: "settings.json",
    editable: true,
  });
  const local: ConfigFile | null = existsSync(SETTINGS_LOCAL)
    ? toConfigFile({
        path: SETTINGS_LOCAL,
        label: "settings.local.json",
        editable: true,
      })
    : null;
  return SettingsResponse.parse({ settings: main, local });
}
