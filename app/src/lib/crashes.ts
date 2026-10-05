import type { YearRange } from "./types";

/**
 * One row per crash, stored column-wise (see data/prep_crash_data.py).
 * Categorical columns hold indexes into keys[field]. Every chart, the map and
 * every mode aggregate from this one table, so they all follow the same filters.
 */
export type CategoryField =
  | "severity"
  | "manner"
  | "weather"
  | "light"
  | "route"
  | "county"
  | "units"
  | "surface"
  | "workZone"
  | "intersection"
  | "schoolBus"
  | "agency"
  | "faultFull"
  | "faultGeo";

/** Category fields the filter panel offers as multi-select lists. */
export type ListField = "manner" | "route" | "surface" | "weather" | "light" | "workZone" | "intersection" | "schoolBus" | "agency";

/** towed / injTrans codes: 0 = No, 1 = Yes, 2 = not recorded */
export const IND_NO = 0;
export const IND_YES = 1;
export const IND_NOT_RECORDED = 2;

export interface CrashData {
  n: number;
  /** Latest crash date in the extract, YYYY-MM-DD. */
  lastDate: string;
  keys: Record<CategoryField, string[]>;
  cols: {
    lat: (number | null)[];
    lon: (number | null)[];
    year: number[];
    fatalities: number[];
    injured: number[];
    towed: number[];
    injTrans: number[];
    /** 0-23, or -1 when the report has no usable time */
    hour: number[];
    /** 0 = Monday ... 6 = Sunday, -1 unknown */
    dow: number[];
    /** 1-12, -1 unknown */
    month: number[];
  } & Record<CategoryField, number[]>;
}

/** FMCSA reportable-crash criteria: a fatality, a vehicle towed, an injured person transported. */
export type FmcsaType = "fatal" | "towed" | "injTrans";

export interface Filters {
  yearRange: YearRange;
  /** County name, or null for statewide. */
  county: string | null;
  /** Unit categories to keep; empty = all. */
  units: string[];
  /** Crash must match at least one checked type; empty = all crashes. */
  fmcsa: FmcsaType[];
  /** Severity labels switched off (from the map legend). */
  severityOff: string[];
  /** Values to keep per list field; a missing or empty list = all. */
  lists: Partial<Record<ListField, string[]>>;
}

export function defaultFilters(yearRange: YearRange): Filters {
  return { yearRange, county: null, units: [], fmcsa: [], severityOff: [], lists: {} };
}

/** Number of filters that differ from the defaults, for the filter button badge. */
export function activeFilterCount(f: Filters, fullRange: YearRange): number {
  let n = 0;
  if (f.yearRange[0] !== fullRange[0] || f.yearRange[1] !== fullRange[1]) n++;
  if (f.county) n++;
  if (f.units.length) n++;
  if (f.fmcsa.length) n++;
  if (f.severityOff.length) n++;
  for (const v of Object.values(f.lists)) if (v?.length) n++;
  return n;
}

/** A filter to leave out of one computation: a top-level key, one list field, or "lists" for all of them. */
type FilterKey = keyof Omit<Filters, "yearRange" | "lists"> | ListField | "lists";

/**
 * Indexes of the crashes that pass the filters. `ignore` drops filters for one
 * computation, e.g. the manner picker counts crashes across all manners so its
 * own selection doesn't zero out the other options.
 */
export function filterCrashes(data: CrashData, f: Filters, ignore: FilterKey[] = []): number[] {
  const { cols, keys } = data;
  const from = Number(f.yearRange[0]);
  const to = Number(f.yearRange[1]);
  const applies = (k: FilterKey) => !ignore.includes(k);

  const countyIdx = applies("county") && f.county ? keys.county.indexOf(f.county) : -1;
  const unitSet = applies("units") && f.units.length ? new Set(f.units.map((u) => keys.units.indexOf(u))) : null;
  const sevOff = applies("severityOff") && f.severityOff.length
    ? new Set(f.severityOff.map((s) => keys.severity.indexOf(s)))
    : null;
  const listSets: [number[], Set<number>][] = [];
  if (applies("lists")) {
    for (const [field, values] of Object.entries(f.lists) as [ListField, string[] | undefined][]) {
      if (!values?.length || !applies(field)) continue;
      listSets.push([cols[field], new Set(values.map((v) => keys[field].indexOf(v)))]);
    }
  }
  const fatalIdx = keys.severity.indexOf("Fatal");
  const fm = applies("fmcsa") ? f.fmcsa : [];

  const out: number[] = [];
  for (let i = 0; i < data.n; i++) {
    const y = cols.year[i];
    if (y < from || y > to) continue;
    if (countyIdx >= 0 && cols.county[i] !== countyIdx) continue;
    if (unitSet && !unitSet.has(cols.units[i])) continue;
    if (sevOff && sevOff.has(cols.severity[i])) continue;
    let listMiss = false;
    for (const [col, set] of listSets) {
      if (!set.has(col[i])) {
        listMiss = true;
        break;
      }
    }
    if (listMiss) continue;
    if (fm.length) {
      const hit =
        (fm.includes("fatal") && (cols.severity[i] === fatalIdx || cols.fatalities[i] > 0)) ||
        (fm.includes("towed") && cols.towed[i] === IND_YES) ||
        (fm.includes("injTrans") && cols.injTrans[i] === IND_YES);
      if (!hit) continue;
    }
    out.push(i);
  }
  return out;
}

export interface CountRow {
  label: string;
  count: number;
  fatalities: number;
  injured: number;
}

/** Crash counts (plus people killed / injured) per category, largest first. */
export function countBy(data: CrashData, idx: number[], field: CategoryField): CountRow[] {
  const keys = data.keys[field];
  const col = data.cols[field];
  const rows = keys.map((label) => ({ label, count: 0, fatalities: 0, injured: 0 }));
  for (const i of idx) {
    const r = rows[col[i]];
    r.count++;
    r.fatalities += data.cols.fatalities[i];
    r.injured += data.cols.injured[i];
  }
  return rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

/** Two-way table: one row per `rowField` category, one column per `colField` category. */
export function crossTab(
  data: CrashData,
  idx: number[],
  rowField: CategoryField | "year",
  colField: CategoryField
): Record<string, string | number>[] {
  const colKeys = data.keys[colField];
  const table = new Map<string, Record<string, string | number>>();
  const rowLabel = (i: number) =>
    rowField === "year" ? String(data.cols.year[i]) : data.keys[rowField][data.cols[rowField][i]];
  for (const i of idx) {
    const r = rowLabel(i);
    let row = table.get(r);
    if (!row) {
      row = { [rowField]: r };
      for (const k of colKeys) row[k] = 0;
      table.set(r, row);
    }
    row[colKeys[data.cols[colField][i]]] = (row[colKeys[data.cols[colField][i]]] as number) + 1;
  }
  return [...table.values()];
}

export function totals(data: CrashData, idx: number[]) {
  let fatalities = 0;
  let injured = 0;
  for (const i of idx) {
    fatalities += data.cols.fatalities[i];
    injured += data.cols.injured[i];
  }
  return { crashes: idx.length, fatalities, injured };
}

/** Yes / No / not-recorded counts for an indicator column. */
export function indicatorCounts(data: CrashData, idx: number[], field: "towed" | "injTrans") {
  const c = [0, 0, 0];
  const col = data.cols[field];
  for (const i of idx) c[col[i]]++;
  return { no: c[IND_NO], yes: c[IND_YES], notRecorded: c[IND_NOT_RECORDED] };
}

/** Crash counts per value of an integer column (hour, dow, month), 0..size-1; unknowns (-1) skipped. */
export function countByInt(data: CrashData, idx: number[], field: "hour" | "dow" | "month", size: number, offset = 0) {
  const c = new Array(size).fill(0) as number[];
  const col = data.cols[field];
  for (const i of idx) {
    const v = col[i] - offset;
    if (v >= 0 && v < size) c[v]++;
  }
  return c;
}

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function yearLabel(r: YearRange) {
  return r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2025 covers Jan–Mar only" when the extract ends before December, else null. */
export function partialYearNote(data: CrashData, range: YearRange): string | null {
  const [y, m] = data.lastDate.split("-");
  if (!y || !m || m === "12" || Number(range[1]) < Number(y)) return null;
  return `${y} covers Jan–${MONTHS[Number(m) - 1]} only, so it looks low next to full years.`;
}
