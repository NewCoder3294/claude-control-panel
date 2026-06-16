import { useEffect, useState } from "react";
import { api } from "@/api/client";
import { peek, run, subscribe } from "@/lib/queryCache";
import type { SurfaceId } from "@/nav";

type Counts = Partial<Record<SurfaceId, number>>;

/**
 * Sidebar badge counts. Reads through the shared query cache, so it both warms
 * the cache (opening those tabs is then instant) and stays live: when a view or
 * a mutation updates/invalidates a key, the matching badge refetches. The slow
 * surfaces (MCP health, context map) are intentionally excluded.
 */
export function useCounts(): Counts {
  const [counts, setCounts] = useState<Counts>({});

  useEffect(() => {
    let alive = true;

    function track<T>(
      id: SurfaceId,
      fetcher: () => Promise<T>,
      count: (data: T) => number,
    ): () => void {
      const apply = () => {
        if (!alive) return;
        const cached = peek<T>(fetcher);
        if (cached) {
          setCounts((prev) => ({ ...prev, [id]: count(cached.data) }));
        } else {
          // First load or invalidated by a mutation: refetch. run() dedups with
          // any view fetching the same key and notifies on success, which
          // re-fires this subscriber with data present.
          void run(fetcher, fetcher).catch(() => {});
        }
      };
      const unsub = subscribe(fetcher, apply);
      apply();
      return unsub;
    }

    const unsubs = [
      track(
        "instructions",
        api.getInstructions,
        (d) => 1 + d.projects.length + d.rules.length,
      ),
      track("memory", api.getMemory, (d) => d.files.length + (d.index ? 1 : 0)),
      track("skills", api.getSkills, (d) => d.active.length),
      track("commands", api.getCommands, (d) => d.commands.length),
      track("agents", api.getAgents, (d) => d.agents.length),
      track("backups", api.getBackups, (d) => d.backups.length),
      track("settings", api.getSettings, (d) => (d.local ? 2 : 1)),
      track(
        "code-trust",
        api.getCodeTrust,
        (d) => d.projects.reduce((n, p) => n + p.fixes.length, 0),
      ),
    ];

    return () => {
      alive = false;
      for (const unsub of unsubs) unsub();
    };
  }, []);

  return counts;
}
