/** Output of data/prep_corridors.py. Arrays in crashRoute / crashMile line up with crashes.json rows. */
export type CorridorClass = "Interstate" | "US Route" | "State Route";

export interface CorridorRoute {
  id: string;
  class: CorridorClass;
  lengthMi: number;
  direction: string;
  /** [lat, lon] pairs, simplified, in milepost order */
  path: [number, number][];
  counties: { county: string; fromMi: number; toMi: number }[];
  metros: { name: string; fromMi: number; toMi: number }[];
}

export interface CorridorData {
  preliminary: boolean;
  source: string;
  snapMiles: number;
  routes: CorridorRoute[];
  /** index into routes, or -1 when the crash wasn't placed on a route */
  crashRoute: number[];
  crashMile: (number | null)[];
}

export const CORRIDOR_CLASSES: { id: CorridorClass; label: string }[] = [
  { id: "Interstate", label: "Interstates" },
  { id: "US Route", label: "US routes" },
  { id: "State Route", label: "State routes" },
];

// Keep in step with US_ROUTES in data/prep_corridors.py.
const US_ROUTES = new Set([
  11, 19, 23, 25, 27, 31, 41, 43, 45, 51, 61, 64, 70, 72, 74, 76, 78, 79, 127, 129, 231, 321, 341, 411, 412, 421, 431,
  441, 641,
]);

/** Corridor id ("I-40", "US-70", "SR-840") for a placeholder highway feature, as prep_corridors.py names it. */
export function corridorIdFor(p: { route_type: string; route_label: string }): string {
  if (p.route_type === "Interstate") return p.route_label;
  const m = p.route_label.match(/(\d+)([A-Z]?)\s*$/i);
  if (!m) return p.route_label;
  const n = Number(m[1]);
  return `${US_ROUTES.has(n) ? "US" : "SR"}-${n}${m[2].toUpperCase()}`;
}

/** Normalise typed input ("i40", "US 70", "sr840", "70") to a corridor id, or null. */
export function matchCorridor(routes: CorridorRoute[], input: string): CorridorRoute | null {
  const v = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!v) return null;
  const m = v.match(/^(I|US|SR|TN)?-?(\d+[A-Z]?)$/);
  if (!m) return null;
  const prefix = m[1] === "TN" ? "SR" : m[1];
  const candidates = prefix ? [`${prefix}-${m[2]}`] : [`I-${m[2]}`, `US-${m[2]}`, `SR-${m[2]}`];
  for (const c of candidates) {
    const hit = routes.find((r) => r.id === c);
    if (hit) return hit;
  }
  return null;
}
