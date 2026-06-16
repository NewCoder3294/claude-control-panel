import { createContext, useContext } from "react";
import type { SurfaceId } from "@/nav";

export interface NavigationApi {
  /** Switch to a surface and (optionally) request a file path be selected. */
  navigate: (surface: SurfaceId, selectPath?: string) => void;
  /** The path a freshly-navigated view should select, if any. */
  pendingSelect: string | null;
  /** Views call this once they've consumed the pending selection. */
  consumePendingSelect: () => void;
}

const NavigationContext = createContext<NavigationApi | null>(null);

export const NavigationProvider = NavigationContext.Provider;

export function useNavigation(): NavigationApi {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    return {
      navigate: () => {},
      pendingSelect: null,
      consumePendingSelect: () => {},
    };
  }
  return ctx;
}
