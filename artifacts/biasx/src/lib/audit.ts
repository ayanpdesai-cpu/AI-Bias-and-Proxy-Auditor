// Pure analytics for BiasX. No DOM, no React. Everything runs in browser memory.
import { isSensitive } from "@/lib/knowledge";

export type ColumnType = "numeric" | "categorical";
export type RiskLevel = "high" | "medium" | "low";

export interface ParsedData {
  columns: string[];
  /** Trimmed raw cell text; null marks a missing value. */
  rows: Record<string, string | null>[];
  fileName: string;
  /** Columns currently labelled NUM (inferred, or overridden by the user). */
  numericColumns: string[];
  columnTypes: Record<string, ColumnType>;
  /** Every column; the target is excluded at audit time. */
  allFeatureColumns: string[];
  missingCounts: Record<string, number>;
  /** Human-readable data-quality notes. */
  notes: string[];
}

export interface AuditResult {
  name: string;
  /** Absolute Pearson r. 0 when pearsonApplicable is false. */
  corr: number;
  /** Mutual information in bits. */
  mi: number;
  /** Max-minus-min outcome-rate gap, binary outcomes only. */
  disp: number | null;
  risk: RiskLevel;
  triggers: string[];
  /** True when the feature is treated as categorical. */
  isEncoded: boolean;
  pearsonApplicable: boolean;
}

export interface TargetInfo {
  type: ColumnType;
  binary: boolean;
  /** Describes how a binary outcome is mapped to 0/1; null when not binary. */
  mapping: string | null;
  note: string;
}

export const MI_HIGH = 0.4;
export const MI_MED = 0.15;
export const DISP_HIGH = 0.35;
export const DISP_MED = 0.15;

export const DISPARITY_METHOD =
  "Group disparity = max minus min positive-outcome rate across feature groups (outcome mapped to 0/1). It is a rate gap, not the four-fifths selection ratio.";

// ── CSV parsing ────────────────────────────────────────────────────────────
export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvError";
  }
}

const MISSING = /^(?:|na|n\/a|nan|null|#n\/a|\?|-|--)$/i;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function isMissingToken(v: string): boolean {
  return MISSING.test(v.trim());
}

/** Strict conversion: the whole trimmed cell must be a plain decimal number. */
export function parseStrictNumber(v: string): number | null {
  const t = v.trim();
  if (!NUMBER.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseRecords(text: string): { records: string[][]; lines: number[] } {
  const records: string[][] = [];
  const lines: number[] = [];
  let rec: string[] = [];
  let field = "";
  let inQ = false;
  let closed = false;
  let hadQuote = false;
  let line = 1;
  let recLine = 1;
  let quoteLine = 1;

  const endField = () => { rec.push(field); field = ""; closed = false; hadQuote = false; };
  const endRecord = () => {
    const blank = rec.length === 0 && field.trim() === "" && !hadQuote;
    if (!blank) { endField(); records.push(rec); lines.push(recLine); }
    rec = []; field = ""; closed = false; hadQuote = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; closed = true; }
      } else { if (c === "\n") line++; field += c; }
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recLine = line;
      continue;
    }
    if (closed) {
      if (c === ",") { endField(); continue; }
      if (c === " " || c === "\t") continue;
      throw new CsvError(`Unexpected character "${c}" after a closing quote on line ${line}. Quotes inside a quoted field must be doubled ("").`);
    }
    if (c === ",") { endField(); continue; }
    if (c === '"' && field.trim() === "") { field = ""; inQ = true; hadQuote = true; quoteLine = line; continue; }
    field += c;
  }
  if (inQ) throw new CsvError(`A quoted field that starts on line ${quoteLine} is never closed. Check for a missing closing quote.`);
  endRecord();
  return { records, lines };
}

function inferColumnTypes(columns: string[], rows: ParsedData["rows"]): Record<string, ColumnType> {
  const NAME_HINT = /(?:^|[_\s-])(id|key|code|zip|postal|phone|ssn|account|category|type|status|group|segment|class|flag|indicator|gender|sex|race|ethnicity|marital|state|country|district|region|department|insurance|plan|tier)(?:$|[_\s-])/i;
  return Object.fromEntries(columns.map(col => {
    const present = rows.map(r => r[col]).filter((v): v is string => v != null);
    const nums = present.map(parseStrictNumber);
    const allNumeric = present.length > 0 && nums.every(n => n !== null);
    const unique = new Set(nums).size;
    const lowCardinality = allNumeric && (
      unique <= 2 || (unique <= 12 && present.length >= 20 && unique / present.length <= 0.25)
    );
    const named = NAME_HINT.test(col);
    return [col, allNumeric && !named && !lowCardinality ? "numeric" : "categorical"] as [string, ColumnType];
  }));
}

function computeNotes(columns: string[], rows: ParsedData["rows"], types: Record<string, ColumnType>): { notes: string[]; missingCounts: Record<string, number> } {
  const notes: string[] = [];
  const missingCounts: Record<string, number> = Object.create(null);
  for (const col of columns) {
    let missing = 0, invalid = 0;
    for (const r of rows) {
      const v = r[col];
      if (v == null) missing++;
      else if (types[col] === "numeric" && parseStrictNumber(v) === null) invalid++;
    }
    missingCounts[col] = missing;
    if (missing === rows.length) notes.push(`"${col}" has no values at all, so it carries no signal.`);
    else if (missing > 0) notes.push(`"${col}" has ${missing} missing value${missing > 1 ? "s" : ""}; those rows are skipped for this column.`);
    if (invalid > 0) notes.push(`"${col}" is labelled NUM but ${invalid} value${invalid > 1 ? "s are" : " is"} not numeric; they are ignored. Switch it to CAT to use the text values.`);
  }
  return { notes, missingCounts };
}

function withTypes(base: Omit<ParsedData, "numericColumns" | "missingCounts" | "notes" | "columnTypes" | "allFeatureColumns">, columnTypes: Record<string, ColumnType>): ParsedData {
  const { notes, missingCounts } = computeNotes(base.columns, base.rows, columnTypes);
  return {
    ...base,
    columnTypes,
    numericColumns: base.columns.filter(c => columnTypes[c] === "numeric"),
    allFeatureColumns: base.columns,
    missingCounts,
    notes,
  };
}

/** Parse CSV text. Throws CsvError with a helpful message when the file cannot be used. */
export function buildData(csv: string, fileName: string): ParsedData {
  const text = csv.replace(/^\uFEFF/, "");
  if (text.trim() === "") throw new CsvError("The file is empty. Add a header row and at least two data rows.");
  const { records, lines } = parseRecords(text);
  const header = records[0].map(h => h.trim());
  const emptyAt = header.findIndex(h => h === "");
  if (emptyAt >= 0) throw new CsvError(`Column ${emptyAt + 1} in the header row has no name. Every column needs a name.`);
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h)) throw new CsvError(`The column name "${h}" appears more than once in the header. Rename one of them.`);
    seen.add(h);
  }
  if (header.length < 2) {
    throw new CsvError(/[;\t|]/.test(header[0] ?? "")
      ? "Only one column was found. BiasX reads comma-separated files; this one looks like it uses semicolons, tabs, or pipes."
      : "BiasX needs at least 2 columns: one target and one feature to compare against it.");
  }
  if (records.length < 3) throw new CsvError("Found a header but fewer than 2 data rows. Add more rows to analyse.");

  const rows: ParsedData["rows"] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length !== header.length) {
      throw new CsvError(`Row ${r} (line ${lines[r]}) has ${rec.length} field${rec.length === 1 ? "" : "s"} but the header has ${header.length}. Check for an unquoted comma or a missing value.`);
    }
    const row: Record<string, string | null> = Object.create(null);
    header.forEach((col, i) => {
      const v = rec[i].trim();
      row[col] = isMissingToken(v) ? null : v;
    });
    rows.push(row);
  }
  return withTypes({ columns: header, rows, fileName }, inferColumnTypes(header, rows));
}

/** Return a copy of the data with one column relabelled NUM or CAT. */
export function setColumnType(data: ParsedData, column: string, type: ColumnType): ParsedData {
  if (!data.columns.includes(column) || data.columnTypes[column] === type) return data;
  return withTypes(
    { columns: data.columns, rows: data.rows, fileName: data.fileName },
    { ...data.columnTypes, [column]: type },
  );
}

// ── Column preparation ─────────────────────────────────────────────────────
interface Prepared {
  categorical: boolean;
  /** Numeric value, or category code for categorical columns; null when missing/ignored. */
  values: (number | null)[];
  labels: string[]; // category code -> display label
}

function prepare(data: ParsedData, col: string): Prepared {
  const categorical = data.columnTypes[col] === "categorical";
  if (!categorical) {
    return { categorical, labels: [], values: data.rows.map(r => (r[col] == null ? null : parseStrictNumber(r[col] as string))) };
  }
  const codes = new Map<string, number>();
  const labels: string[] = [];
  const values = data.rows.map(r => {
    const v = r[col];
    if (v == null) return null;
    // Preserve the source category identity. Case folding could silently merge
    // distinct identifiers such as "a" and "A".
    const key = v;
    let code = codes.get(key);
    if (code === undefined) { code = labels.length; codes.set(key, code); labels.push(v); }
    return code;
  });
  return { categorical, labels, values };
}

const POSITIVE = new Set(["1", "true", "yes", "y", "t", "approved", "positive", "pass", "accepted", "hired"]);

interface BinaryOutcome { y: (0 | 1 | null)[]; zero: string; one: string; asIs: boolean }

function binaryOutcome(p: Prepared): BinaryOutcome | null {
  const distinct = [...new Set(p.values.filter((v): v is number => v !== null))];
  if (distinct.length !== 2) return null;
  let zeroV: number, oneV: number, zero: string, one: string, asIs = false;
  if (!p.categorical) {
    [zeroV, oneV] = distinct.sort((a, b) => a - b);
    zero = String(zeroV); one = String(oneV);
    asIs = zeroV === 0 && oneV === 1;
  } else {
    const [a, b] = distinct;
    const pa = POSITIVE.has(p.labels[a].toLowerCase()), pb = POSITIVE.has(p.labels[b].toLowerCase());
    if (pa !== pb) { oneV = pa ? a : b; zeroV = pa ? b : a; }
    else { [zeroV, oneV] = [a, b].sort((x, y) => p.labels[x].localeCompare(p.labels[y])); }
    zero = p.labels[zeroV]; one = p.labels[oneV];
  }
  return { y: p.values.map(v => (v === null ? null : v === oneV ? 1 : 0)), zero, one, asIs };
}

export function getTargetInfo(data: ParsedData, target: string): TargetInfo {
  if (!data.columns.includes(target)) return { type: "categorical", binary: false, mapping: null, note: "" };
  const p = prepare(data, target);
  const bin = binaryOutcome(p);
  const type = data.columnTypes[target];
  if (!bin) {
    return {
      type, binary: false, mapping: null,
      note: "Target is not binary, so group disparity is not computed." +
        (p.categorical ? " Pearson is N/A for a non-binary categorical target." : ""),
    };
  }
  const mapping = bin.asIs
    ? `Binary outcome used as 0/1 (1 = ${bin.one}).`
    : `Binary outcome mapped to 0/1: "${bin.zero}" = 0, "${bin.one}" = 1.`;
  return { type, binary: true, mapping, note: mapping };
}

// ── Statistics ─────────────────────────────────────────────────────────────
function range(xs: number[]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const x of xs) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return [lo, hi];
}

function pearsonAbs(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my;
    num += ex * ey; dx += ex * ex; dy += ey * ey;
  }
  const d = Math.sqrt(dx * dy);
  return d === 0 ? 0 : Math.min(1, Math.abs(num / d));
}

function binIndex(values: number[], discrete: boolean, bins: number): number[] {
  if (discrete) {
    const idx = new Map<number, number>();
    return values.map(v => { if (!idx.has(v)) idx.set(v, idx.size); return idx.get(v) as number; });
  }
  const [lo, hi] = range(values);
  const r = hi - lo || 1;
  return values.map(v => Math.min(Math.floor(((v - lo) / r) * bins), bins - 1));
}

/** Mutual information in bits plus the entropies needed for normalisation. */
function miStats(xs: number[], ys: number[], discreteX: boolean, discreteY: boolean) {
  const n = xs.length;
  if (n < 2) return { mi: 0, hx: 0, hy: 0 };
  const bins = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const bx = binIndex(xs, discreteX, bins);
  const by = binIndex(ys, discreteY, bins);
  const cx = new Map<number, number>(), cy = new Map<number, number>(), cj = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    cx.set(bx[i], (cx.get(bx[i]) ?? 0) + 1);
    cy.set(by[i], (cy.get(by[i]) ?? 0) + 1);
    const k = `${bx[i]}|${by[i]}`;
    cj.set(k, (cj.get(k) ?? 0) + 1);
  }
  let mi = 0;
  cj.forEach((c, k) => {
    const [a, b] = k.split("|").map(Number);
    mi += (c / n) * Math.log2((c * n) / ((cx.get(a) as number) * (cy.get(b) as number)));
  });
  const ent = (m: Map<number, number>) => [...m.values()].reduce((s, c) => s - (c / n) * Math.log2(c / n), 0);
  return { mi: Math.max(0, mi), hx: ent(cx), hy: ent(cy) };
}

function pairs(a: Prepared, b: Prepared) {
  const xs: number[] = [], ys: number[] = [], idx: number[] = [];
  for (let i = 0; i < a.values.length; i++) {
    const x = a.values[i], y = b.values[i];
    if (x !== null && y !== null) { xs.push(x); ys.push(y); idx.push(i); }
  }
  return { xs, ys, idx };
}

/** Pearson is valid for quantitative columns and binary categories only. */
function pearsonFor(a: Prepared, b: Prepared, xs: number[], ys: number[]) {
  const okA = !a.categorical || a.labels.length === 2;
  const okB = !b.categorical || b.labels.length === 2;
  const applicable = okA && okB && xs.length >= 2;
  return { applicable, r: applicable ? pearsonAbs(xs, ys) : 0 };
}

function disparity(feature: Prepared, outcome: BinaryOutcome | null): number | null {
  if (!outcome) return null;
  const groups = new Map<number, { n: number; pos: number }>();
  for (let i = 0; i < feature.values.length; i++) {
    const x = feature.values[i], y = outcome.y[i];
    if (x === null || y === null) continue;
    const g = groups.get(x) ?? { n: 0, pos: 0 };
    g.n++; g.pos += y;
    groups.set(x, g);
  }
  if (groups.size > 12 || groups.size < 2) return null;
  const rates = [...groups.values()].filter(g => g.n >= 2).map(g => g.pos / g.n);
  if (rates.length < 2) return null;
  return Math.max(...rates) - Math.min(...rates);
}

// ── Audit ──────────────────────────────────────────────────────────────────
export function auditDataset(data: ParsedData, target: string, threshold: number): AuditResult[] {
  if (!data.columns.includes(target)) return [];
  const t = prepare(data, target);
  const outcome = binaryOutcome(t);
  const order = { high: 2, medium: 1, low: 0 };

  return data.columns
    .filter(c => c !== target)
    .map(name => {
      const f = prepare(data, name);
      const { xs, ys } = pairs(f, t);
      const p = pearsonFor(f, t, xs, ys);
      const mi = xs.length >= 4 ? miStats(xs, ys, f.categorical, t.categorical).mi : 0;
      const disp = disparity(f, outcome);
      const corr = p.r;
      const triggers: string[] = [];
      let risk: RiskLevel = "low";

      if (p.applicable && corr >= threshold) { triggers.push(`Pearson r = ${corr.toFixed(3)} — strong linear correlation (above ${threshold.toFixed(2)} threshold)`); risk = "high"; }
      else if (p.applicable && corr >= threshold * 0.65) { triggers.push(`Pearson r = ${corr.toFixed(3)} — moderate linear correlation`); risk = "medium"; }
      if (mi >= MI_HIGH) { triggers.push(`Mutual Information = ${mi.toFixed(3)} bits — strong non-linear association`); risk = "high"; }
      else if (mi >= MI_MED) { triggers.push(`Mutual Information = ${mi.toFixed(3)} bits — moderate non-linear association`); if (risk === "low") risk = "medium"; }
      if (disp !== null && disp >= DISP_HIGH) { triggers.push(`Group disparity = ${(disp * 100).toFixed(1)}% — large outcome rate gap between groups`); risk = "high"; }
      else if (disp !== null && disp >= DISP_MED) { triggers.push(`Group disparity = ${(disp * 100).toFixed(1)}% — notable outcome rate gap between groups`); if (risk === "low") risk = "medium"; }
      if (isSensitive(name)) { triggers.push(`"${name}" matches a known sensitive or protected attribute`); if (risk === "low") risk = "medium"; }

      return { name, corr, mi, disp, risk, triggers, isEncoded: f.categorical, pearsonApplicable: p.applicable } as AuditResult;
    })
    .sort((a, b) => order[b.risk] - order[a.risk] || b.corr - a.corr);
}

// ── Heatmap ────────────────────────────────────────────────────────────────
export interface HeatCell { value: number; method: string }

/** Association matrix for any set of columns (including the target). */
export function buildHeatmap(data: ParsedData, columns: string[]): HeatCell[][] {
  const cols = [...new Set(columns)].filter(c => data.columns.includes(c));
  const prepared = Object.fromEntries(cols.map(c => [c, prepare(data, c)]));
  return cols.map(a => cols.map(b => {
    if (a === b) return { value: 1, method: "Self association" };
    const pa = prepared[a], pb = prepared[b];
    const { xs, ys } = pairs(pa, pb);
    if (xs.length < 2) return { value: 0, method: "Insufficient data" };
    const p = pearsonFor(pa, pb, xs, ys);
    if (p.applicable) return { value: p.r, method: "Absolute Pearson r" };
    const s = miStats(xs, ys, pa.categorical, pb.categorical);
    const h = Math.max(s.hx, s.hy);
    return { value: h > 0 ? Math.min(1, s.mi / h) : 0, method: "Normalized mutual information (Pearson N/A)" };
  }));
}

/** White (0) to deep red (1). */
export function corrToColor(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return `rgb(255,${Math.round(255 - c * 215)},${Math.round(255 - c * 215)})`;
}
