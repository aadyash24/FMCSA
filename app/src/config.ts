import type { DashboardMode } from "./lib/types";

/**
 * Which tabs the dashboard shows.
 *
 * Presentation mode hides the tabs still under construction, so a sponsor
 * meeting (FMCSA) sees a short, finished story and the rest is described as in
 * progress on the Overview. Turn it on either way:
 *   - add ?present to the URL (stays on while you click around), or
 *   - build with VITE_PRESENTATION=true to make it the default for a deploy.
 * ?present=0 turns it off again for a presentation build.
 *
 * Edit PRESENTATION_TABS to change what is shown.
 */
export const ALL_TABS: DashboardMode[] = ["overview", "explore", "manner", "corridor", "factors"];
export const PRESENTATION_TABS: DashboardMode[] = ["overview", "explore", "corridor"];

export function isPresentation(): boolean {
  const q = new URLSearchParams(window.location.search).get("present");
  if (q !== null) return q !== "0" && q !== "false";
  return import.meta.env.VITE_PRESENTATION === "true";
}

export function visibleTabs(): DashboardMode[] {
  return isPresentation() ? PRESENTATION_TABS : ALL_TABS;
}
