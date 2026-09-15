export type DashboardMode = "explore" | "risk" | "predict";

export interface Summary {
  totalCrashes: number;
  totalFatalities: number;
  totalInjured: number;
  yearRange: [string, string];
  generatedFrom: string;
}

export interface YearlyRow {
  year: string;
  crashes: number;
  fatalities: number;
  injured: number;
}

export interface SeverityByYear {
  series: Record<string, string | number>[];
  keys: string[];
}

export interface CountyRow {
  county: string;
  crashes: number;
  fatalities: number;
  injured: number;
}

export interface CountRow {
  count: number;
  [key: string]: string | number;
}

// [lat, lon, year, severityLabel]
export type CrashPoint = [number, number, number, string];
