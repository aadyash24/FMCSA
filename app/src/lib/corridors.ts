/** Output of data/prep_corridors.py. Arrays in crashRoute / crashMile line up with crashes.json rows. */
export interface CorridorRoute {
  id: string;
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
  /** index into routes, or -1 when the crash wasn't placed on an interstate */
  crashRoute: number[];
  crashMile: (number | null)[];
}
