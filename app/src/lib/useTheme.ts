import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

/** Subscribes to the OS color-scheme preference. */
function subscribeSystem(onChange: () => void) {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Owns the theme choice and keeps <html data-theme> in sync.
 *
 * The resolved theme is derived during render rather than held in state: the OS
 * preference comes from useSyncExternalStore, so a system-level flip re-renders
 * on its own and there is no second state to keep in step.
 */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readStoredTheme);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => "light" as ResolvedTheme);
  const resolved: ResolvedTheme = choice === "system" ? system : choice;

  // Writing to the document and to storage is genuine external synchronization.
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    storeTheme(choice);
  }, [choice]);

  const cycle = useCallback(() => {
    setChoice((c) => (c === "light" ? "dark" : c === "dark" ? "system" : "light"));
  }, []);

  return { choice, resolved, setChoice, cycle };
}
