/**
 * Theme handling.
 *
 * Three user-facing states: light, dark, and system. Dark is the default, to
 * match the UConn CT Crash dashboard this layout follows; "system" follows the OS.
 *
 * The chosen theme is written to <html data-theme>, which every stylesheet keys
 * off, and remembered in localStorage. Storage is wrapped because it throws in
 * private windows and in some embedded browsers.
 */
export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tn-cmv-theme";

export function readStoredTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // private window or blocked storage, fall through to the default
  }
  return "dark";
}

export function storeTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // not fatal: the theme still applies for this page view
  }
}

export function systemTheme(): ResolvedTheme {
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === "system" ? systemTheme() : choice;
}

export function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}
