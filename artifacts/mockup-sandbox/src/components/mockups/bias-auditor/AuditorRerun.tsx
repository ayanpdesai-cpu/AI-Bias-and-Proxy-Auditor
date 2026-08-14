// ── Imports (all at top) ───────────────────────────────────────────────────
import { useState, useRef, useCallback, useMemo } from "react";
import {
  Upload, AlertTriangle, CheckCircle, Info, BookOpen,
  X, RefreshCw, FileText, ChevronDown, ChevronUp, Download,
  Play, AlertCircle, BarChart2, FileDown, Database,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import jsPDF from "jspdf";

// ── BiasX Logo ─────────────────────────────────────────────────────────────
function BiasXLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="BiasX">
      <defs>
        <linearGradient id="bxg1" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#bxg1)" />
      {/* Rising bar chart */}
      <rect x="6"  y="26" width="5" height="7"  rx="1.5" fill="white" fillOpacity="0.5" />
      <rect x="13" y="20" width="5" height="13" rx="1.5" fill="white" fillOpacity="0.7" />
      <rect x="20" y="14" width="5" height="19" rx="1.5" fill="white" fillOpacity="0.9" />
      {/* Red X badge */}
      <circle cx="31" cy="11" r="7.5" fill="#ef4444" />
      <line x1="27.5" y1="7.5"  x2="34.5" y2="14.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="34.5" y1="7.5"  x2="27.5" y2="14.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedData {
  columns: string[];
  rows: Record<string, number | string>[];
  fileName: string;
  numericColumns: string[];     // purely numeric — for target dropdown
  allFeatureColumns: string[];  // every column (excluding default target)
}
interface AuditResult {
  name: string;
  corr: number;
  mi: number;
  disp: number | null;
  risk: "high" | "medium" | "low";
  triggers: string[];
  isEncoded: boolean;           // true if column was label-encoded (was non-numeric)
}

// ── CSV / data helpers ─────────────────────────────────────────────────────
function parseCSV(text: string): { columns: string[]; rows: Record<string, number | string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, number | string> = {};
    columns.forEach((col, i) => {
      const n = parseFloat(vals[i] ?? "");
      row[col] = isNaN(n) ? (vals[i] ?? "") : n;
    });
    return row;
  });
  return { columns, rows };
}

function numericCols(columns: string[], rows: Record<string, number | string>[]): string[] {
  // Check ALL rows (not just 20) so large datasets are fully scanned
  return columns.filter(col => rows.every(r => typeof r[col] === "number"));
}

// Label-encode a column: string values → integers; numeric values stay as-is.
// Returns { nums, encoded: true if any string values were found }
function encodeColumn(col: string, rows: Record<string, number | string>[]): { nums: number[]; encoded: boolean } {
  const vals = rows.map(r => r[col]);
  const hasStrings = vals.some(v => typeof v === "string");
  if (!hasStrings) return { nums: vals as number[], encoded: false };
  // Build label map
  const labels = new Map<string, number>();
  let idx = 0;
  vals.forEach(v => {
    const key = String(v).toLowerCase().trim();
    if (!labels.has(key)) labels.set(key, idx++);
  });
  return { nums: vals.map(v => labels.get(String(v).toLowerCase().trim()) ?? 0), encoded: true };
}

function buildData(csv: string, fileName: string): ParsedData {
  const { columns, rows } = parseCSV(csv);
  const nc = numericCols(columns, rows);
  return { columns, rows, fileName, numericColumns: nc, allFeatureColumns: columns };
}

// ── Analytics ──────────────────────────────────────────────────────────────
function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const ex = xs[i] - mx, ey = ys[i] - my;
    num += ex * ey; dx += ex * ex; dy += ey * ey;
  }
  return Math.sqrt(dx * dy) === 0 ? 0 : Math.abs(num / Math.sqrt(dx * dy));
}
function mutualInformation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const bins = Math.max(2, Math.min(8, Math.floor(Math.sqrt(n))));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rX = (maxX - minX) || 1, rY = (maxY - minY) || 1;
  const joint: number[][] = Array.from({ length: bins }, () => Array(bins).fill(0));
  const mX: number[] = Array(bins).fill(0);
  const mY: number[] = Array(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const bx = Math.min(Math.floor(((xs[i] - minX) / rX) * bins), bins - 1);
    const by = Math.min(Math.floor(((ys[i] - minY) / rY) * bins), bins - 1);
    joint[bx][by]++; mX[bx]++; mY[by]++;
  }
  let mi = 0;
  for (let i = 0; i < bins; i++)
    for (let j = 0; j < bins; j++)
      if (joint[i][j] > 0 && mX[i] > 0 && mY[j] > 0)
        mi += (joint[i][j] / n) * Math.log2((joint[i][j] * n) / (mX[i] * mY[j]));
  return Math.max(0, mi);
}
function disparityScore(xs: number[], ys: number[]): number | null {
  const unique = [...new Set(xs)];
  if (unique.length > 12 || unique.length < 2) return null;
  const means = unique.map(v => {
    const group = ys.filter((_, i) => xs[i] === v);
    if (group.length < 2) return NaN;
    return group.reduce((a, b) => a + b, 0) / group.length;
  }).filter(m => !isNaN(m));
  if (means.length < 2) return null;
  return Math.max(...means) - Math.min(...means);
}

const MI_HIGH = 0.4, MI_MED = 0.1, DISP_HIGH = 0.35, DISP_MED = 0.15;

// ── Sample datasets ────────────────────────────────────────────────────────
const EXAMPLE_DATASETS = [
  {
    id: "hiring",
    label: "🧑‍💻 Tech Hiring",
    desc: "Hiring decisions with demographic & geographic signals",
    target: "approved",
    fileName: "tech_hiring.csv",
    csv: `coding_score,zip_code,has_a_child,years_experience,gender,age,approved
95,10001,1,8,M,32,1
42,90210,1,2,F,27,0
78,10001,0,6,M,35,1
61,30301,1,4,F,29,0
88,10001,1,7,M,41,1
33,90210,0,1,F,24,0
91,10001,1,9,M,38,1
55,30301,0,3,F,31,0
82,10001,0,7,M,36,1
47,90210,1,2,F,26,0
73,10001,0,5,M,33,1
66,30301,1,5,F,34,0
90,10001,0,10,M,45,1
38,90210,1,1,F,23,0
79,10001,0,6,M,37,1
52,30301,1,3,F,28,0`,
  },
  {
    id: "loan",
    label: "🏦 Loan Approval",
    desc: "Loan decisions with financial and personal attributes",
    target: "loan_approved",
    fileName: "loan_approval.csv",
    csv: `credit_score,annual_income,zip_code,marital_status,criminal_record,age,loan_amount,loan_approved
720,85000,10001,married,0,34,20000,1
580,32000,90210,single,1,27,15000,0
690,67000,10001,married,0,41,25000,1
610,41000,30301,divorced,0,38,10000,0
750,92000,10001,married,0,29,30000,1
540,28000,90210,single,1,24,8000,0
700,75000,10001,married,0,45,22000,1
560,35000,30301,single,1,31,12000,0
730,88000,10001,married,0,36,28000,1
590,39000,90210,divorced,1,28,9000,0
670,58000,10001,married,0,43,18000,1
630,47000,30301,single,0,33,11000,0
760,98000,10001,married,0,52,35000,1
520,25000,90210,single,1,22,6000,0
710,79000,10001,divorced,0,39,24000,1
575,31000,30301,single,1,26,7000,0`,
  },
  {
    id: "hospital",
    label: "🏥 Hospital Readmission",
    desc: "Healthcare readmission with protected attributes",
    target: "readmitted",
    fileName: "hospital_readmission.csv",
    csv: `age,bmi,blood_pressure,zip_code,race_group,insurance_type,prior_visits,readmitted
67,28.4,135,10001,White,Private,2,0
54,31.2,158,90210,Black,Medicaid,5,1
72,26.8,142,10001,White,Private,1,0
61,33.5,165,30301,Hispanic,Medicaid,4,1
58,29.1,138,10001,White,Private,2,0
79,35.2,172,90210,Black,None,7,1
63,27.6,140,10001,White,Private,1,0
45,30.8,155,30301,Hispanic,Medicaid,3,1
70,28.9,137,10001,White,Private,2,0
83,36.1,178,90210,Black,None,8,1
55,29.4,143,10001,Asian,Private,1,0
68,32.7,162,30301,Hispanic,Medicaid,5,1
74,27.2,133,10001,White,Private,2,0
49,34.6,168,90210,Black,Medicaid,6,1
66,28.0,139,10001,White,Private,1,0
77,37.3,175,30301,Hispanic,None,7,1`,
  },
] as const;

// ── Bias knowledge base ────────────────────────────────────────────────────
const BIAS_REASONS: Record<string, string> = {
  zip_code:         "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  zipcode:          "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  gender:           "Gender is a protected attribute; including it can directly discriminate against applicants.",
  sex:              "Sex is a protected attribute and a direct proxy for gender discrimination.",
  age:              "Age is a protected attribute and can disadvantage older or younger candidates.",
  race:             "Race is a protected attribute — using it is directly discriminatory.",
  race_group:       "Race / ethnicity grouping is a directly protected attribute.",
  ethnicity:        "Ethnicity is a protected attribute — using it is directly discriminatory.",
  name:             "Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
  address:          "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
  income:           "Income correlates with race, gender, and class — it can amplify existing societal inequalities.",
  annual_income:    "Annual income correlates with race, gender, and class — it can amplify existing inequalities.",
  has_a_child:      "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  has_a_kid:        "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  marital_status:   "Marital status intersects with gender and can lead to indirect discrimination.",
  criminal_record:  "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history:   "Arrest history strongly correlates with race and should almost never be used as a feature.",
  insurance_type:   "Insurance type correlates with income, race, and socioeconomic status — a proxy for protected characteristics.",
};
const MEDIUM_RISK_REASONS: Record<string, string> = {
  has_a_child:      "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_a_kid:        "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_kids:         "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  children:         "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  num_children:     "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  marital_status:   "Marital status intersects with gender and can lead to indirect discrimination against women or LGBTQ+ applicants.",
  pregnant:         "Pregnancy status is a legally protected characteristic in many jurisdictions.",
  criminal_record:  "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history:   "Arrest history strongly correlates with race and should almost never be used as a feature.",
  income:           "Income correlates with race, gender, and class — even a weak measured correlation can mask compounding inequality.",
  annual_income:    "Annual income correlates with race, gender, and class — even a weak correlation can mask compounding inequality.",
  name:             "Names can reveal ethnicity or gender to a downstream model even if this dataset's correlation score looks low.",
  zip_code:         "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger dataset.",
  zipcode:          "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger dataset.",
  gender:           "Gender is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a gender shortcut.",
  sex:              "Sex is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a shortcut.",
  age:              "Age is a protected attribute. Low correlation now can grow once the model encounters a broader distribution.",
  race:             "Race is directly discriminatory regardless of measured correlation.",
  race_group:       "Race / ethnicity grouping is directly discriminatory regardless of measured correlation.",
  ethnicity:        "Ethnicity is directly discriminatory regardless of measured correlation.",
  religion:         "Religion is a protected attribute in most anti-discrimination laws.",
  nationality:      "Nationality can proxy for race or ethnicity and is a protected characteristic in many jurisdictions.",
  disability:       "Disability status is a legally protected attribute and its inclusion is rarely justified.",
  insurance_type:   "Insurance type correlates with socioeconomic status, race, and income — a proxy for protected characteristics.",
  bmi:              "BMI / body weight can correlate with disability status and may introduce proxy bias.",
  weight:           "Body weight can correlate with disability status and may introduce proxy bias.",
};
const SENSITIVE_FIELDS = new Set([
  "gender","sex","gender_identity","biological_sex","male","female","is_male","is_female",
  "age","dob","date_of_birth","birth_date","birthdate","birth_year","year_of_birth","age_group","age_band",
  "race","race_group","ethnicity","ethnic_group","ethnic_background","race_ethnicity","racial_group",
  "religion","faith","religious_belief","denomination",
  "nationality","citizenship","country_of_birth","country_of_origin","national_origin","birthplace",
  "disability","disabled","has_disability","disability_status","health_condition","mental_health",
  "has_a_child","has_a_kid","has_kids","has_children","is_parent","have_children","num_children",
  "num_kids","children","kids","child_count","parent","parental_status","family_status",
  "marital_status","marital","married","is_married","marriage_status","civil_status",
  "divorced","widowed","single","relationship_status",
  "pregnant","pregnancy","is_pregnant","expecting",
  "zip_code","zipcode","zip","postcode","postal_code","area_code","neighborhood","neighbourhood",
  "district","borough","census_tract","county_fips",
  "name","full_name","first_name","last_name","surname","family_name","given_name",
  "address","street_address","home_address","residential_address",
  "income","household_income","annual_income","salary","net_worth","wealth",
  "poverty_level","benefits","social_security","welfare",
  "criminal_record","criminal_history","arrest_history","felony","conviction","prior_offenses",
  "weight","height","bmi","body_mass_index",
  "insurance_type","insurance","coverage_type",
]);

function getBiasReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return BIAS_REASONS[k] ?? `"${f}" may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.`;
}
function getMediumRiskReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return MEDIUM_RISK_REASONS[k] ?? `"${f}" is a known sensitive attribute. Even a low score in this sample doesn't guarantee it won't introduce bias in production.`;
}
function isSensitive(f: string): boolean {
  return SENSITIVE_FIELDS.has(f.toLowerCase().replace(/[^a-z_]/g, ""));
}

// ── Heatmap colour: white (0) → deep red (1) ───────────────────────────────
function corrToColor(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return `rgb(255,${Math.round(255 - c * 215)},${Math.round(255 - c * 215)})`;
}

// ── PDF generation ─────────────────────────────────────────────────────────
function generatePDF(fileName: string, results: AuditResult[], currentTarget: string, threshold: number) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, ML = 16, MR = 16, CW = W - ML - MR;
  const PAGE_H = 297, FOOTER = 10, SAFE_BOTTOM = PAGE_H - FOOTER - 12;
  const flagged = results.filter(r => r.risk === "high");
  const medium  = results.filter(r => r.risk === "medium");
  const safe    = results.filter(r => r.risk === "low");
  const today   = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

  // ── helpers ────────────────────────────────────────────────────────────
  const setStyle = (size: number, style: "normal" | "bold" = "normal", rgb: [number,number,number] = [50,50,50]) => {
    doc.setFontSize(size); doc.setFont("helvetica", style); doc.setTextColor(...rgb);
  };
  // Returns line array and height consumed
  const wrappedLines = (text: string, maxW: number, size: number, style: "normal" | "bold" = "normal"): string[] => {
    doc.setFontSize(size); doc.setFont("helvetica", style);
    return doc.splitTextToSize(text, maxW) as string[];
  };
  const lineH = (size: number) => size * 0.45; // mm per line for given font size
  let curPage = 1;
  const ensureSpace = (needed: number, y: number): number => {
    if (y + needed > SAFE_BOTTOM) {
      doc.addPage(); curPage++;
      // Thin header bar on continuation pages
      doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 10, "F");
      doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.text("BiasX — AI Bias & Proxy Variable Audit Report  (continued)", ML, 7);
      return 18;
    }
    return y;
  };

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1 — Executive Summary
  // ════════════════════════════════════════════════════════════════════════
  // Header
  doc.setFillColor(55, 48, 163); doc.rect(0, 0, W, 46, "F");
  // Accent bar
  doc.setFillColor(99, 102, 241); doc.rect(0, 44, W, 2, "F");

  // Logo placeholder (coloured square)
  doc.setFillColor(79, 70, 229); doc.roundedRect(ML, 8, 20, 20, 4, 4, "F");
  doc.setFillColor(239,68,68); doc.circle(ML + 15, 11, 5, "F");
  doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont("helvetica", "bold");
  doc.text("BX", ML + 13, 12.5, { align: "center" });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text("BiasX", ML + 24, 18);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("AI Bias & Proxy Variable Audit Report", ML + 24, 26);
  doc.setFontSize(8);
  doc.text(`${today}  ·  Dataset: ${fileName}  ·  Target variable: ${currentTarget}`, ML + 24, 33);
  doc.text(`Pearson threshold: ${threshold.toFixed(2)}  ·  Features audited: ${results.length}`, ML + 24, 39);

  // Stat boxes
  let y = 54;
  const bW = (CW - 10) / 3;
  const statBoxes: { count: number; label: string; sub: string; bg: [number,number,number]; fg: [number,number,number]; border: [number,number,number] }[] = [
    { count: flagged.length, label: "High Risk",   sub: "Immediate action",  bg: [254,242,242], fg: [185,28,28],  border: [252,165,165] },
    { count: medium.length,  label: "Medium Risk",  sub: "Needs review",      bg: [255,251,235], fg: [146,64,14],  border: [253,211,77]  },
    { count: safe.length,    label: "Safe",          sub: "No action needed",  bg: [240,253,244], fg: [21,128,61],  border: [134,239,172] },
  ];
  statBoxes.forEach((b, i) => {
    const bX = ML + i * (bW + 5);
    doc.setFillColor(...b.bg); doc.roundedRect(bX, y, bW, 24, 3, 3, "F");
    doc.setDrawColor(...b.border); doc.setLineWidth(0.4);
    doc.roundedRect(bX, y, bW, 24, 3, 3, "S");
    doc.setTextColor(...b.fg); doc.setFontSize(24); doc.setFont("helvetica", "bold");
    doc.text(String(b.count), bX + bW / 2, y + 14, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    doc.text(b.label, bX + bW / 2, y + 19, { align: "center" });
    doc.setFontSize(7); doc.setFont("helvetica", "normal");
    doc.text(b.sub, bX + bW / 2, y + 23, { align: "center" });
  });
  y += 32;

  // Overview paragraph
  setStyle(11, "bold", [30,30,30]); doc.text("Overview", ML, y); y += 6;
  const overviewText = `This report audits ${results.length} feature${results.length !== 1 ? "s" : ""} from "${fileName}" against the target outcome "${currentTarget}" using four independent bias-detection signals: Pearson Correlation (linear associations between a feature and the target), Mutual Information (non-linear dependencies Pearson may miss), Group Disparity (outcome rate differences between demographic groups), and Sensitive Attribute Detection (name-based matching against known protected fields). Risk threshold for Pearson: ${threshold.toFixed(2)}.`;
  const overviewLines = wrappedLines(overviewText, CW, 9);
  setStyle(9, "normal", [70,70,70]);
  doc.text(overviewLines, ML, y);
  y += overviewLines.length * lineH(9) + 8;

  // Proxy variable box
  const proxyBodyText = "A proxy variable is a column that doesn't directly measure a protected characteristic — but is statistically correlated with one. Example: ZIP code never mentions race, but due to historical residential segregation it strongly predicts it. A model trained on ZIP codes can learn to discriminate by race without ever seeing a race column. Common proxies: last name → ethnicity · parental status → gender · neighbourhood → race/income · criminal record → race · insurance type → income.";
  const proxyLines = wrappedLines(proxyBodyText, CW - 10, 8.5);
  const proxyBoxH = 8 + proxyLines.length * lineH(8.5) + 6;
  y = ensureSpace(proxyBoxH + 4, y);
  doc.setFillColor(238, 242, 255); doc.roundedRect(ML, y, CW, proxyBoxH, 3, 3, "F");
  doc.setDrawColor(199, 210, 254); doc.setLineWidth(0.3); doc.roundedRect(ML, y, CW, proxyBoxH, 3, 3, "S");
  doc.setFillColor(79, 70, 229); doc.roundedRect(ML, y, 3, proxyBoxH, 1, 1, "F");
  setStyle(9, "bold", [55, 48, 163]); doc.text("What is a Proxy Variable?", ML + 6, y + 7);
  setStyle(8.5, "normal", [67, 56, 202]);
  doc.text(proxyLines, ML + 6, y + 13);
  y += proxyBoxH + 8;

  // Detection methods
  y = ensureSpace(50, y);
  setStyle(11, "bold", [30,30,30]); doc.text("Detection Methods", ML, y); y += 6;
  const methods = [
    ["📐 Pearson Correlation", "Measures the linear correlation coefficient between a feature and the target. Values above the threshold trigger HIGH risk."],
    ["🔗 Mutual Information", "Quantifies total statistical dependence (including non-linear patterns) in bits. Catches associations Pearson misses."],
    ["⚖️ Group Disparity", "For features with ≤12 unique values, measures the maximum outcome rate gap between value groups."],
    ["🏷️ Sensitive Attribute", "Flags columns whose names match a library of 70+ known protected or proxy attribute names, regardless of scores."],
  ];
  methods.forEach(([title, desc]) => {
    y = ensureSpace(18, y);
    const descLines = wrappedLines(desc, CW - 6, 8.5);
    setStyle(8.5, "bold", [55,65,81]); doc.text(title + ":", ML + 3, y);
    y += lineH(8.5) + 1;
    setStyle(8.5, "normal", [80,80,80]); doc.text(descLines, ML + 5, y);
    y += descLines.length * lineH(8.5) + 4;
  });

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 2 — Feature Risk Table
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); curPage++;
  doc.setFillColor(55, 48, 163); doc.rect(0, 0, W, 16, "F");
  setStyle(13, "bold", [255,255,255]); doc.text("Feature Risk Analysis", ML, 11);
  setStyle(8, "normal", [199,210,254]); doc.text(`${results.length} features  ·  target: ${currentTarget}  ·  threshold: ${threshold.toFixed(2)}`, W - MR, 11, { align: "right" });

  // Column definitions — widths add up to CW exactly
  const TC = [
    { l: "Feature",     x: ML,       w: 38 },
    { l: "Type",        x: ML + 39,  w: 16 },
    { l: "Risk",        x: ML + 56,  w: 19 },
    { l: "Pearson r",   x: ML + 76,  w: 20 },
    { l: "MI (bits)",   x: ML + 97,  w: 20 },
    { l: "Disparity",   x: ML + 118, w: 20 },
    { l: "Primary Signal", x: ML + 139, w: 49 },
  ];
  let ty = 22;
  // Header row
  doc.setFillColor(243, 244, 246); doc.rect(ML, ty, CW, 8, "F");
  doc.setDrawColor(209,213,219); doc.setLineWidth(0.2); doc.line(ML, ty + 8, ML + CW, ty + 8);
  setStyle(7.5, "bold", [75,85,99]);
  TC.forEach(c => doc.text(c.l, c.x + 1, ty + 5.5));
  ty += 8;

  results.forEach((r, ri) => {
    // Compute wrapped signal text within column width
    const sigRaw = r.triggers[0] ?? (isSensitive(r.name) ? "Sensitive attribute name detected" : "—");
    const sigLines = wrappedLines(sigRaw, TC[6].w - 2, 7);
    const rowH = Math.max(7, sigLines.length * lineH(7) + 3);

    ty = ensureSpace(rowH + 2, ty);
    if (ty === 18) { // new page was started by ensureSpace
      // Re-render header
      doc.setFillColor(243,244,246); doc.rect(ML, ty, CW, 8, "F");
      setStyle(7.5, "bold", [75,85,99]);
      TC.forEach(c => doc.text(c.l, c.x + 1, ty + 5.5));
      ty += 8;
    }

    const bg: [number,number,number] = r.risk === "high" ? [254,242,242] : r.risk === "medium" ? [255,251,235] : ri % 2 === 0 ? [255,255,255] : [249,250,251];
    doc.setFillColor(...bg); doc.rect(ML, ty, CW, rowH, "F");
    doc.setDrawColor(229,231,235); doc.setLineWidth(0.15); doc.line(ML, ty + rowH, ML + CW, ty + rowH);

    const midY = ty + rowH / 2 + 1.5;
    const fg: [number,number,number] = r.risk === "high" ? [185,28,28] : r.risk === "medium" ? [146,64,14] : [55,65,81];
    setStyle(7.5, r.risk !== "low" ? "bold" : "normal", fg);
    doc.text(r.name.slice(0, 22), TC[0].x + 1, midY);
    setStyle(7, "normal", [120,130,145]);
    doc.text(r.isEncoded ? "categorical" : "numeric", TC[1].x + 1, midY);
    setStyle(7.5, "bold", fg);
    doc.text(r.risk === "high" ? "HIGH" : r.risk === "medium" ? "MEDIUM" : "LOW", TC[2].x + 1, midY);
    setStyle(7.5, "normal", [80,80,80]);
    doc.text(r.corr.toFixed(3), TC[3].x + 1, midY);
    doc.text(r.mi.toFixed(3), TC[4].x + 1, midY);
    doc.text(r.disp != null ? `${(r.disp * 100).toFixed(1)}%` : "—", TC[5].x + 1, midY);
    setStyle(7, "normal", [80,80,80]);
    doc.text(sigLines, TC[6].x + 1, ty + 4.5);
    ty += rowH;
  });

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 3 — Recommendations
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage(); curPage++;
  doc.setFillColor(55, 48, 163); doc.rect(0, 0, W, 16, "F");
  setStyle(13, "bold", [255,255,255]); doc.text("Recommendations", ML, 11);
  let ry = 24;

  const drawRecBox = (
    name: string, corr: number, mi: number, bodyText: string,
    bg: [number,number,number], accent: [number,number,number], hfg: [number,number,number], bfg: [number,number,number],
  ) => {
    const headerText = `${name}  ·  Pearson r = ${corr.toFixed(3)}  ·  MI = ${mi.toFixed(3)} bits`;
    const bodyLines = wrappedLines(bodyText, CW - 12, 8.5);
    const boxH = 5 + lineH(9) + 3 + bodyLines.length * lineH(8.5) + 6;
    ry = ensureSpace(boxH + 4, ry);
    doc.setFillColor(...bg); doc.roundedRect(ML, ry, CW, boxH, 3, 3, "F");
    doc.setFillColor(...accent); doc.roundedRect(ML, ry, 4, boxH, 2, 2, "F");
    setStyle(9, "bold", hfg); doc.text(headerText, ML + 8, ry + 7);
    setStyle(8.5, "normal", bfg); doc.text(bodyLines, ML + 8, ry + 13);
    ry += boxH + 4;
  };

  if (flagged.length > 0) {
    setStyle(11, "bold", [185,28,28]); doc.text("High Risk — Immediate Action Required", ML, ry); ry += 8;
    flagged.forEach(r => drawRecBox(
      r.name, r.corr, r.mi,
      "Remove or replace this feature before training. If it cannot be excluded, apply a fairness-aware algorithm (e.g. reweighing or adversarial debiasing) and document the justification in your Model Card. Run demographic parity checks post-training.",
      [254,242,242], [239,68,68], [185,28,28], [120,20,20],
    ));
    ry += 4;
  }

  if (medium.length > 0) {
    ry = ensureSpace(16, ry);
    setStyle(11, "bold", [146,64,14]); doc.text("Medium Risk — Review Carefully", ML, ry); ry += 8;
    medium.forEach(r => drawRecBox(
      r.name, r.corr, r.mi,
      "Evaluate whether this feature is strictly necessary for the model's purpose. If retained, test for disparate impact across all protected groups and apply bias mitigation techniques. Document the decision.",
      [255,251,235], [245,158,11], [146,64,14], [110,60,10],
    ));
    ry += 4;
  }

  ry = ensureSpace(60, ry);
  setStyle(11, "bold", [30,30,30]); doc.text("General Best Practices", ML, ry); ry += 7;
  const practices = [
    "Run demographic parity, equalized odds, and calibration checks before deploying any model trained on this data.",
    "Establish a fairness testing pipeline that re-runs automatically on every model retrain — bias can re-enter via data drift.",
    "Document all feature inclusion decisions in a Model Card or Datasheets for Datasets artifact.",
    "Have a diverse, cross-functional team review dataset composition and model outputs before production release.",
    "Re-audit whenever the source population, data collection process, or target definition changes.",
    "For high-stakes decisions (credit, hiring, healthcare), consider third-party bias audits in addition to automated tools.",
  ];
  practices.forEach(rec => {
    const lines = wrappedLines(`• ${rec}`, CW - 5, 9);
    ry = ensureSpace(lines.length * lineH(9) + 3, ry);
    setStyle(9, "normal", [70,70,70]); doc.text(lines, ML + 3, ry);
    ry += lines.length * lineH(9) + 3;
  });

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(209,213,219); doc.setLineWidth(0.3);
    doc.line(ML, PAGE_H - 12, W - MR, PAGE_H - 12);
    setStyle(7.5, "normal", [150,150,150]);
    doc.text(`BiasX  ·  Confidential — for internal use only  ·  Page ${i} of ${totalPages}`, ML, PAGE_H - 7);
    doc.text(today, W - MR, PAGE_H - 7, { align: "right" });
  }

  doc.save(`biasx-audit-${fileName.replace(/\.csv$/i, "").replace(/[^a-z0-9]/gi, "_")}.pdf`);
}

// ── CorrelationBar ─────────────────────────────────────────────────────────
function CorrelationBar({ value, risk }: { value: number; risk: "high" | "medium" | "low" }) {
  const bar =
    risk === "high"   ? "bg-gradient-to-r from-red-400 to-red-600" :
    risk === "medium" ? "bg-gradient-to-r from-amber-400 to-orange-400" :
                        "bg-gradient-to-r from-emerald-400 to-emerald-500";
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${bar}`} style={{ width: `${value * 100}%` }} />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">{value.toFixed(2)}</span>
    </div>
  );
}

// ── Proxy Variable Info Banner ─────────────────────────────────────────────
function ProxyInfoBanner({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-indigo-50/60 transition-colors">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-indigo-900">What is a Proxy Variable? What does this tool do?</p>
          <p className="text-xs text-indigo-500 mt-0.5">Click to {open ? "collapse" : "expand"} the explainer</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-indigo-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="bg-white rounded-xl border border-indigo-100 p-4">
            <h3 className="text-sm font-bold text-indigo-800 mb-2">🔍 What is a Proxy Variable?</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              A <strong>proxy variable</strong> is a dataset column that doesn't directly measure a protected characteristic — but is <em>correlated</em> with one.
            </p>
            <p className="text-xs text-gray-600 leading-relaxed mt-2">
              <strong>Example:</strong> ZIP code doesn't mention race, but due to historical residential segregation it strongly predicts it. An AI trained on ZIP codes can learn to discriminate by race <em>without ever seeing race as a column</em>.
            </p>
            <div className="mt-3 bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700 leading-relaxed">
              <strong>Other common proxies:</strong> last name → ethnicity · parental status → gender · neighbourhood → income/race · criminal record → race
            </div>
          </div>
          <div className="bg-white rounded-xl border border-indigo-100 p-4">
            <h3 className="text-sm font-bold text-indigo-800 mb-2">🛡️ What Does BiasX Do?</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              BiasX scans your CSV dataset <strong>before you train a model</strong> and flags features that may introduce unfair bias — across <strong>all</strong> columns, numeric and categorical.
            </p>
            <ul className="mt-2 space-y-2">
              {[
                ["📐 Pearson Correlation", "Linear link between feature and outcome"],
                ["🔗 Mutual Information", "Non-linear associations Pearson would miss"],
                ["⚖️ Group Disparity", "Outcome gaps between categorical groups"],
                ["🏷️ Protected Attribute", "Name matches a known sensitive field (70+ names)"],
              ].map(([t, d]) => (
                <li key={t as string} className="text-xs text-gray-600 flex gap-2">
                  <span className="font-semibold shrink-0">{t as string}:</span><span>{d as string}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Correlation Heatmap ────────────────────────────────────────────────────
function CorrelationHeatmap({ data, cols }: { data: ParsedData; cols: string[] }) {
  const numericOnly = useMemo(() => cols.filter(c => data.numericColumns.includes(c)), [cols, data]);
  const matrix = useMemo(() =>
    numericOnly.map(colA =>
      numericOnly.map(colB => {
        if (colA === colB) return 1;
        const xs = data.rows.map(r => r[colA] as number);
        const ys = data.rows.map(r => r[colB] as number);
        return pearson(xs, ys);
      })
    ), [data, numericOnly]);

  if (numericOnly.length < 2) {
    return <p className="text-xs text-gray-400">Heatmap requires at least 2 numeric columns.</p>;
  }

  const cellSz = Math.min(66, Math.max(38, Math.floor(500 / Math.max(numericOnly.length, 1))));
  const labelW = 84;
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 mb-0.5">Correlation Heatmap</h3>
      <p className="text-xs text-gray-500 mb-3">Pearson correlation between every pair of numeric features. Darker red = stronger correlation. Indigo diagonal = self (always 1.0).</p>
      <div className="overflow-auto">
        <div className="inline-flex flex-col">
          <div className="flex" style={{ marginLeft: labelW }}>
            {numericOnly.map(col => (
              <div key={col} style={{ width: cellSz, minWidth: cellSz }} className="text-center px-0.5">
                <span className="text-xs text-gray-500 block truncate" title={col}>{col.slice(0, 8)}</span>
              </div>
            ))}
          </div>
          {matrix.map((row, i) => (
            <div key={numericOnly[i]} className="flex items-center">
              <div style={{ width: labelW, minWidth: labelW }} className="text-xs text-gray-600 truncate pr-2 text-right shrink-0" title={numericOnly[i]}>{numericOnly[i].slice(0, 11)}</div>
              {row.map((val, j) => (
                <div key={j} style={{ width: cellSz, height: cellSz, minWidth: cellSz, backgroundColor: i === j ? "#4f46e5" : corrToColor(val), border: "1px solid #e5e7eb" }}
                  className="flex items-center justify-center cursor-default" title={`${numericOnly[i]} × ${numericOnly[j]}: ${val.toFixed(3)}`}>
                  <span style={{ color: (i === j || val > 0.55) ? "#fff" : "#374151", fontSize: cellSz < 46 ? "9px" : "11px" }} className="font-mono font-bold">{val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-400">Low</span>
          <div className="flex h-3 rounded overflow-hidden" style={{ width: 120 }}>
            {Array.from({ length: 12 }, (_, k) => <div key={k} style={{ flex: 1, backgroundColor: corrToColor(k / 11) }} />)}
          </div>
          <span className="text-xs text-gray-400">High</span>
          <div className="w-5 h-3 rounded ml-4" style={{ backgroundColor: "#4f46e5" }} />
          <span className="text-xs text-gray-400">Self (diagonal)</span>
        </div>
      </div>
    </div>
  );
}

// ── Feature Risk Chart ─────────────────────────────────────────────────────
function FeatureRiskChart({ results, currentTarget }: { results: AuditResult[]; currentTarget: string }) {
  const data = results.map(r => ({
    name: r.name,
    "Pearson r": parseFloat(r.corr.toFixed(3)),
    "MI (bits)": parseFloat(Math.min(r.mi, 1).toFixed(3)),
    "Disparity": r.disp != null ? parseFloat(r.disp.toFixed(3)) : 0,
    risk: r.risk,
  }));
  const SIG_COLORS: Record<string, string> = { "Pearson r": "#6366f1", "MI (bits)": "#f59e0b", "Disparity": "#ef4444" };
  const riskFill: Record<string, string> = { high: "#dc2626", medium: "#f59e0b", low: "#10b981" };
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 mb-0.5">Feature Risk Scores</h3>
      <p className="text-xs text-gray-500 mb-3">
        Three bias-detection scores per feature vs. <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>. Pearson r bar is colour-coded by risk level.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 52)}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 32, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 10 }} tickFormatter={v => v.toFixed(1)} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [v.toFixed(3), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          {(["Pearson r", "MI (bits)", "Disparity"] as const).map(key => (
            <Bar key={key} dataKey={key} fill={SIG_COLORS[key]} radius={[0, 4, 4, 0]}>
              {data.map(d => (
                <Cell key={d.name} fill={key === "Pearson r" ? riskFill[d.risk] : SIG_COLORS[key]} fillOpacity={key === "Pearson r" ? 1 : 0.55} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Pearson r:</span>
        {[["🔴 High", "#dc2626"], ["🟡 Medium", "#f59e0b"], ["🟢 Low", "#10b981"]].map(([l, c]) => (
          <div key={l as string} className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c as string }} />{l as string}
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-2 font-medium">Others:</span>
        {[["MI", "#f59e0b"], ["Disparity", "#ef4444"]].map(([l, c]) => (
          <div key={l as string} className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm opacity-55" style={{ backgroundColor: c as string }} />{l as string}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function AuditorRerun() {
  const [data, setData]               = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol]     = useState("approved");
  const [threshold, setThreshold]     = useState(0.75);
  const [activeTab, setActiveTab]     = useState<"audit" | "viz" | "report" | "preview">("audit");
  const [targetOpen, setTargetOpen]   = useState(false);
  const [dragging, setDragging]       = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [running, setRunning]         = useState(false);
  const [runKey, setRunKey]           = useState(0);
  const [showInfo, setShowInfo]       = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load a preset example dataset
  const loadExample = useCallback((ex: typeof EXAMPLE_DATASETS[number]) => {
    const d = buildData(ex.csv, ex.fileName);
    setData(d);
    setTargetCol(ex.target);
    setUploadError("");
  }, []);

  const activeData   = data ?? buildData(EXAMPLE_DATASETS[0].csv, EXAMPLE_DATASETS[0].fileName);
  const numCols      = activeData.numericColumns;
  const currentTarget = numCols.includes(targetCol) ? targetCol : numCols[numCols.length - 1] ?? "";

  // Analyse every column (numeric AND categorical) except the target
  const results: AuditResult[] = useMemo(() => {
    if (!currentTarget) return [];
    const targetNums = encodeColumn(currentTarget, activeData.rows).nums;
    return activeData.allFeatureColumns
      .filter(c => c !== currentTarget)
      .map(name => {
        const { nums: xs, encoded } = encodeColumn(name, activeData.rows);
        const corr = pearson(xs, targetNums);
        const mi   = mutualInformation(xs, targetNums);
        const disp = disparityScore(xs, targetNums);
        const triggers: string[] = [];
        let risk: "high" | "medium" | "low" = "low";

        if (corr >= threshold)              { triggers.push(`Pearson r = ${corr.toFixed(3)} — strong linear correlation (above ${threshold.toFixed(2)} threshold)`); risk = "high"; }
        else if (corr >= threshold * 0.65)  { triggers.push(`Pearson r = ${corr.toFixed(3)} — moderate linear correlation`); if (risk === "low") risk = "medium"; }
        if (mi >= MI_HIGH)                  { triggers.push(`Mutual Information = ${mi.toFixed(3)} bits — strong non-linear association`); if (risk !== "high") risk = "high"; }
        else if (mi >= MI_MED)              { triggers.push(`Mutual Information = ${mi.toFixed(3)} bits — moderate non-linear association`); if (risk === "low") risk = "medium"; }
        if (disp !== null && disp >= DISP_HIGH)  { triggers.push(`Group disparity = ${(disp * 100).toFixed(1)}% — large outcome rate gap between groups`); if (risk !== "high") risk = "high"; }
        else if (disp !== null && disp >= DISP_MED) { triggers.push(`Group disparity = ${(disp * 100).toFixed(1)}% — notable outcome rate gap between groups`); if (risk === "low") risk = "medium"; }
        if (isSensitive(name))              { triggers.push(`"${name}" matches a known sensitive or protected attribute`); if (risk === "low") risk = "medium"; }

        return { name, corr, mi, disp, risk, triggers, isEncoded: encoded };
      })
      .sort((a, b) => {
        const rOrder = { high: 2, medium: 1, low: 0 };
        return rOrder[b.risk] - rOrder[a.risk] || b.corr - a.corr;
      });
  }, [activeData, currentTarget, threshold]);

  const flagged = useMemo(() => results.filter(r => r.risk === "high"),  [results]);
  const medium  = useMemo(() => results.filter(r => r.risk === "medium"), [results]);
  const safe    = useMemo(() => results.filter(r => r.risk === "low"),   [results]);

  const recs = useMemo(() => {
    const out: string[] = [];
    flagged.forEach(r => out.push(`Remove or replace "${r.name}" — strong bias signal detected (r=${r.corr.toFixed(2)}).`));
    medium.forEach(r => out.push(`Review "${r.name}" — sensitive or protected attribute. Evaluate whether it is strictly necessary.`));
    if (flagged.length > 0 || medium.length > 0) {
      out.push("Run demographic parity and equalized odds checks before deploying any model trained on this data.");
      out.push("Document all feature inclusion decisions in a Model Card or Datasheets for Datasets.");
      out.push("Have a diverse team review the dataset and model outputs before production deployment.");
    }
    return out;
  }, [flagged, medium]);

  const handleRerun = () => { setRunning(true); setTimeout(() => { setRunning(false); setRunKey(k => k + 1); }, 900); };

  const handleFile = useCallback((file: File) => {
    setUploadError("");
    if (!file.name.endsWith(".csv")) { setUploadError("Only CSV files are supported."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const d = buildData(e.target?.result as string, file.name);
      if (d.numericColumns.length < 1) { setUploadError("Need at least 1 numeric column to use as target."); return; }
      setData(d);
      setTargetCol(d.numericColumns[d.numericColumns.length - 1]);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const TABS = [
    { id: "audit",   label: "🔍 Audit Results"   },
    { id: "viz",     label: "📊 Visualizations"   },
    { id: "report",  label: "📋 Download Report"  },
    { id: "preview", label: "🗂️ Data Preview"     },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">

      {/* ── Topbar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 mr-1">
          <BiasXLogo size={32} />
          <div className="hidden sm:block leading-none">
            <span className="text-base font-extrabold tracking-tight" style={{ color: "#4f46e5" }}>Bias</span>
            <span className="text-base font-extrabold tracking-tight text-red-500">X</span>
          </div>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <button onClick={handleRerun} disabled={running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-all ${running ? "bg-indigo-400 text-white cursor-wait" : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"}`}>
          {running ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</> : <><Play className="w-4 h-4 fill-white" /> Run Audit</>}
        </button>
        <span className="text-xs text-gray-400 hidden sm:block">Re-runs on new file or settings change</span>
        <div className="flex-1" />
        {data && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700">
            <FileText className="w-3 h-3" />{data.fileName}
            <button onClick={() => { setData(null); setTargetCol("approved"); }} className="ml-1 text-emerald-400 hover:text-emerald-700"><X className="w-3 h-3" /></button>
          </div>
        )}
        <button onClick={() => generatePDF(activeData.fileName, results, currentTarget, threshold)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-62 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto" style={{ width: 248 }}>
          <div className="px-4 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Data Input</p>
            {data ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-emerald-800 truncate">{data.fileName}</div>
                    <div className="text-xs text-emerald-600">{data.rows.length} rows · {data.columns.length} cols</div>
                  </div>
                </div>
                <button onClick={() => inputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 py-1 font-medium transition-colors">
                  <RefreshCw className="w-3 h-3" /> Replace file
                </button>
              </div>
            ) : (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${dragging ? "border-indigo-400 bg-indigo-100" : "border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"}`}
                >
                  <Upload className="w-5 h-5 text-indigo-500" />
                  <div className="text-center">
                    <div className="text-xs font-semibold text-indigo-700">Upload a CSV file</div>
                    <div className="text-xs text-indigo-400 mt-0.5">or drag & drop</div>
                  </div>
                </div>
              </>
            )}
            {uploadError && <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{uploadError}</p>}
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {/* Example datasets */}
          <div className="px-4 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Database className="w-3 h-3" /> Example Datasets
            </p>
            <div className="space-y-2">
              {EXAMPLE_DATASETS.map(ex => (
                <button key={ex.id} onClick={() => loadExample(ex)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${data?.fileName === ex.fileName ? "bg-indigo-50 border-indigo-300 text-indigo-800" : "bg-gray-50 border-gray-200 text-gray-700 hover:border-indigo-300 hover:bg-indigo-50"}`}>
                  <div className="font-semibold">{ex.label}</div>
                  <div className="text-gray-500 mt-0.5 leading-relaxed">{ex.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Configure audit */}
          <div className="px-4 pt-4 flex-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>
            {numCols.length >= 1 && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Target variable <span className="text-gray-400">(numeric)</span></label>
                  <div className="relative">
                    <button onClick={() => setTargetOpen(o => !o)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors">
                      <span className="truncate">{currentTarget}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${targetOpen ? "rotate-180" : ""}`} />
                    </button>
                    {targetOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        {numCols.map(col => (
                          <button key={col} onClick={() => { setTargetCol(col); setTargetOpen(false); }}
                            className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-indigo-50 transition-colors ${col === currentTarget ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}>
                            {col}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Pearson Threshold</label>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{threshold.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0.5} max={1.0} step={0.05} value={threshold}
                    onChange={e => setThreshold(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0.50</span><span>1.00</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Risk summary */}
          {results.length > 0 && (
            <div className="px-4 pb-4 pt-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 text-center">
                  <div className="text-2xl font-bold text-red-600">{flagged.length}</div>
                  <div className="text-xs text-red-500 font-medium">High</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                  <div className="text-2xl font-bold text-amber-500">{medium.length}</div>
                  <div className="text-xs text-amber-500 font-medium">Medium</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <div className="text-2xl font-bold text-emerald-600">{safe.length}</div>
                  <div className="text-xs text-emerald-500 font-medium">Safe</div>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="p-5 space-y-4" key={runKey}>

            {/* ── Goal banner ─────────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 rounded-2xl p-5 shadow-md">
              <div className="flex items-start gap-4">
                <BiasXLogo size={44} />
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-extrabold text-white tracking-tight leading-tight">
                    Bias<span className="text-red-300">X</span> — AI Bias & Proxy Variable Auditor
                  </h1>
                  <p className="text-sm text-indigo-200 mt-1 leading-relaxed">
                    Upload your training dataset and BiasX detects hidden bias signals across <strong className="text-white">every column</strong> — numeric and categorical — <em>before</em> you train, so you ship fair AI with confidence.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      ["📐", "Pearson", "Linear bias"],
                      ["🔗", "Mutual Info", "Non-linear"],
                      ["⚖️", "Group Disparity", "Outcome gaps"],
                      ["🏷️", "Protected Names", "70+ attribute list"],
                      ["🔡", "Categorical", "Non-numeric columns too"],
                    ].map(([icon, title, sub]) => (
                      <div key={title as string} className="flex items-center gap-1.5 bg-white/10 rounded-lg px-2.5 py-1.5">
                        <span className="text-sm">{icon as string}</span>
                        <div>
                          <p className="text-xs font-semibold text-white leading-none">{title as string}</p>
                          <p className="text-xs text-indigo-300 leading-none mt-0.5">{sub as string}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Proxy info banner */}
            <ProxyInfoBanner open={showInfo} onToggle={() => setShowInfo(v => !v)} />

            {/* Tab card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200 overflow-x-auto">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 shrink-0 ${activeTab === t.id ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Audit Results ──────────────────────────────────────────── */}
              {activeTab === "audit" && (
                <div className="p-5 space-y-3">
                  {running && (
                    <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                      <RefreshCw className="w-4 h-4 text-indigo-600 animate-spin" />
                      <span className="text-sm text-indigo-700 font-medium">Running audit…</span>
                    </div>
                  )}
                  {!running && flagged.length === 0 && medium.length === 0 && results.length > 0 && (
                    <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-800">🎉 No bias signals detected!</p>
                        <p className="text-sm text-emerald-700 mt-0.5">All {results.length} features passed at threshold {threshold.toFixed(2)}.</p>
                      </div>
                    </div>
                  )}
                  {!running && results.map(r => {
                    const cardBg   = r.risk === "high" ? "bg-red-50 border-red-200" : r.risk === "medium" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200";
                    const codeBg   = r.risk === "high" ? "bg-red-100 text-red-800" : r.risk === "medium" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-800";
                    const sigColor = r.risk === "high" ? "text-red-600 bg-red-50 border-red-200" : r.risk === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-500 bg-gray-50 border-gray-200";
                    return (
                      <div key={r.name} className={`rounded-xl border p-4 shadow-sm ${cardBg}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.risk === "high"   && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5" /> HIGH RISK</span>}
                          {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600"><AlertCircle className="w-3.5 h-3.5" /> MEDIUM RISK</span>}
                          {r.risk === "low"    && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> LOW RISK</span>}
                          <span className="text-xs text-gray-400">|</span>
                          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${codeBg}`}>{r.name}</code>
                          {r.isEncoded && <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">categorical</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${sigColor}`}>Pearson r = {r.corr.toFixed(3)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.mi >= MI_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.mi >= MI_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-400 bg-gray-50 border-gray-200"}`}>MI = {r.mi.toFixed(3)} bits</span>
                          {r.disp !== null && <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.disp >= DISP_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.disp >= DISP_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-400 bg-gray-50 border-gray-200"}`}>Disparity = {(r.disp * 100).toFixed(1)}%</span>}
                        </div>
                        <CorrelationBar value={r.corr} risk={r.risk} />
                        {r.triggers.length > 0 && (
                          <div className="mt-2.5 space-y-1">
                            {r.triggers.map((t, i) => (
                              <p key={i} className={`text-xs leading-relaxed rounded-lg px-3 py-1.5 border ${sigColor}`}>
                                <span className="font-semibold">⚑ Signal {i + 1}:</span> {t}
                              </p>
                            ))}
                          </div>
                        )}
                        {(r.risk === "high" || r.risk === "medium") && (
                          <p className={`text-xs leading-relaxed rounded-lg px-3 py-2 mt-1.5 border ${r.risk === "high" ? "text-red-800 bg-red-50 border-red-200" : "text-amber-800 bg-amber-50 border-amber-200"}`}>
                            <span className="font-semibold">Why it may be biased:</span>{" "}
                            {r.risk === "high" ? getBiasReason(r.name) : getMediumRiskReason(r.name)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {results.length === 0 && !running && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                      <Info className="w-4 h-4 mt-0.5 shrink-0" />
                      <span><strong>Getting Started:</strong> Pick an example dataset from the sidebar or upload your own CSV.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Visualizations ─────────────────────────────────────────── */}
              {activeTab === "viz" && (
                <div className="p-5 space-y-8">
                  {results.length >= 1 ? (
                    <>
                      <FeatureRiskChart results={results} currentTarget={currentTarget} />
                      <div className="border-t border-gray-100 pt-6">
                        <CorrelationHeatmap data={activeData} cols={activeData.allFeatureColumns.concat(currentTarget)} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-8 text-gray-400">
                      <BarChart2 className="w-8 h-8 shrink-0" />
                      <p className="text-sm">Load a dataset with at least 2 columns to see visualizations.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Download Report ─────────────────────────────────────────── */}
              {activeTab === "report" && (
                <div className="p-5 space-y-4">
                  <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <FileDown className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white">Download Full PDF Report</h3>
                      <p className="text-xs text-indigo-200 mt-0.5">3 pages: Executive Summary · Feature Risk Table (all columns) · Recommendations</p>
                    </div>
                    <button onClick={() => generatePDF(activeData.fileName, results, currentTarget, threshold)}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 active:scale-95 transition-all shrink-0">
                      <Download className="w-4 h-4" /> Download PDF
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">📄 Executive Summary</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-red-600">{flagged.length}</div>
                          <div className="text-xs text-red-500 font-medium mt-0.5">High Risk</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-amber-500">{medium.length}</div>
                          <div className="text-xs text-amber-500 font-medium mt-0.5">Medium Risk</div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-emerald-600">{safe.length}</div>
                          <div className="text-xs text-emerald-500 font-medium mt-0.5">Safe</div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Audited <strong>{results.length} features</strong> in <strong>{activeData.fileName}</strong> (including categorical columns) against <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>.
                        {flagged.length > 0 && <span className="text-red-700 font-medium"> {flagged.length} feature{flagged.length > 1 ? "s require" : " requires"} immediate action.</span>}
                        {medium.length > 0 && <span className="text-amber-700 font-medium"> {medium.length} feature{medium.length > 1 ? "s need" : " needs"} careful review.</span>}
                        {flagged.length === 0 && medium.length === 0 && <span className="text-emerald-700 font-medium"> No features require action at the current threshold.</span>}
                      </p>
                    </div>
                  </div>

                  {(flagged.length > 0 || medium.length > 0) && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">🚩 Flagged Variables</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {[...flagged, ...medium].map(r => (
                          <div key={r.name} className="flex items-center gap-3 px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${r.risk === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {r.risk === "high" ? "HIGH" : "MEDIUM"}
                            </span>
                            <code className="text-xs font-mono text-gray-800 font-semibold">{r.name}</code>
                            {r.isEncoded && <span className="text-xs text-gray-400">categorical</span>}
                            <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 font-mono">
                              <span>r={r.corr.toFixed(3)}</span>
                              <span>MI={r.mi.toFixed(3)}</span>
                              {r.disp != null && <span>Δ={(r.disp * 100).toFixed(1)}%</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {recs.length > 0 && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">✅ Recommendations</span>
                      </div>
                      <ul className="p-4 space-y-2.5">
                        {recs.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2.5 text-xs text-gray-600 leading-relaxed">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ── Data Preview ────────────────────────────────────────────── */}
              {activeTab === "preview" && (
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4 text-sm text-gray-600">
                    <span>Rows: <strong className="text-gray-900">{activeData.rows.length}</strong></span>
                    <span className="text-gray-300">·</span>
                    <span>Columns: <strong className="text-gray-900">{activeData.columns.length}</strong></span>
                    <span className="text-gray-300">·</span>
                    <span>Numeric: <strong className="text-gray-900">{activeData.numericColumns.length}</strong></span>
                    <span className="text-gray-300">·</span>
                    <span>Categorical: <strong className="text-gray-900">{activeData.columns.length - activeData.numericColumns.length}</strong></span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {activeData.columns.map(col => (
                            <th key={col} className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${col === currentTarget ? "text-indigo-600" : "text-gray-600"}`}>
                              <code>{col}</code>
                              {col === currentTarget && <span className="ml-1 text-indigo-400 font-normal">(target)</span>}
                              {!activeData.numericColumns.includes(col) && col !== currentTarget && <span className="ml-1 text-amber-500 font-normal">cat.</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.rows.slice(0, 12).map((row, i) => (
                          <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            {activeData.columns.map(col => (
                              <td key={col} className={`px-3 py-2 font-mono whitespace-nowrap ${col === currentTarget ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>{String(row[col])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
