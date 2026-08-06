import { useState, useRef, useCallback, useMemo } from "react";
import {
  Shield, Upload, AlertTriangle, CheckCircle, Info, BookOpen,
  X, RefreshCw, FileText, ChevronDown, ChevronUp, Download, Play, AlertCircle,
  BarChart2, FileDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import jsPDF from "jspdf";

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedData {
  columns: string[];
  rows: Record<string, number | string>[];
  fileName: string;
  numericColumns: string[];
}
interface AuditResult {
  name: string;
  corr: number;
  mi: number;
  disp: number | null;
  risk: "high" | "medium" | "low";
  triggers: string[];
}

// ── CSV parsing ────────────────────────────────────────────────────────────
function parseCSV(text: string): { columns: string[]; rows: Record<string, number | string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, number | string> = {};
    columns.forEach((col, i) => {
      const n = parseFloat(vals[i]);
      row[col] = isNaN(n) ? (vals[i] ?? "") : n;
    });
    return row;
  });
  return { columns, rows };
}
function numericCols(columns: string[], rows: Record<string, number | string>[]): string[] {
  return columns.filter((col) => rows.slice(0, 20).every((r) => typeof r[col] === "number"));
}

// ── Analytics ─────────────────────────────────────────────────────────────
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
  const bins = Math.max(2, Math.min(6, Math.floor(Math.sqrt(n))));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rX = (maxX - minX) || 1, rY = (maxY - minY) || 1;
  const joint: number[][] = Array.from({ length: bins }, () => Array(bins).fill(0));
  const mX: number[] = Array(bins).fill(0);
  const mY: number[] = Array(bins).fill(0);
  for (let i = 0; i < n; i++) {
    const bx = Math.min(Math.floor((xs[i] - minX) / rX * bins), bins - 1);
    const by = Math.min(Math.floor((ys[i] - minY) / rY * bins), bins - 1);
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
  if (unique.length > 10 || unique.length < 2) return null;
  const means = unique.map(v => {
    const group = ys.filter((_, i) => xs[i] === v);
    if (group.length < 2) return NaN;
    return group.reduce((a, b) => a + b, 0) / group.length;
  }).filter(m => !isNaN(m));
  if (means.length < 2) return null;
  return Math.max(...means) - Math.min(...means);
}

const MI_HIGH = 0.4, MI_MED = 0.1, DISP_HIGH = 0.40, DISP_MED = 0.20;

// ── Sample data ────────────────────────────────────────────────────────────
const SAMPLE_CSV = `coding_score,zip_code,has_a_child,years_experience,approved
95,10001,1,8,1
42,90210,1,2,0
78,10001,0,6,1
61,30301,1,4,0
88,10001,1,7,1
33,90210,0,1,0
91,10001,1,9,1
55,30301,0,3,0`;

function loadSample(): ParsedData {
  const { columns, rows } = parseCSV(SAMPLE_CSV);
  const nc = numericCols(columns, rows);
  return { columns, rows, fileName: "hiring_data.csv", numericColumns: nc };
}

// ── Bias knowledge base ────────────────────────────────────────────────────
const BIAS_REASONS: Record<string, string> = {
  zip_code: "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  zipcode: "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  gender: "Gender is a protected attribute; including it can directly discriminate against applicants.",
  age: "Age is a protected attribute and can disadvantage older or younger candidates.",
  race: "Race is a protected attribute — using it is directly discriminatory.",
  ethnicity: "Ethnicity is a protected attribute — using it is directly discriminatory.",
  name: "Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
  address: "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
  income: "Income correlates with race, gender, and class — it can amplify existing societal inequalities.",
  has_a_child: "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  has_a_kid: "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  has_kids: "Parental status disproportionately impacts women — a proxy for gender discrimination.",
  marital_status: "Marital status intersects with gender and can lead to indirect discrimination.",
  criminal_record: "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history: "Arrest history strongly correlates with race and should almost never be used as a feature.",
};
const MEDIUM_RISK_REASONS: Record<string, string> = {
  has_a_child: "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_a_kid: "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  has_kids: "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  children: "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  num_children: "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  marital_status: "Marital status intersects with gender and can lead to indirect discrimination against women or LGBTQ+ applicants.",
  pregnant: "Pregnancy status is a legally protected characteristic in many jurisdictions.",
  criminal_record: "Criminal records correlate heavily with race and socioeconomic background.",
  arrest_history: "Arrest history strongly correlates with race and should almost never be used as a feature.",
  income: "Income correlates with race, gender, and class — even a weak measured correlation can mask compounding inequality.",
  name: "Names can reveal ethnicity or gender to a downstream model even if this dataset's correlation score looks low.",
  zip_code: "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger dataset.",
  gender: "Gender is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a gender shortcut.",
  age: "Age is a protected attribute. Low correlation now can grow once the model encounters a broader distribution.",
  race: "Race is directly discriminatory regardless of measured correlation.",
  ethnicity: "Ethnicity is directly discriminatory regardless of measured correlation.",
  religion: "Religion is a protected attribute in most anti-discrimination laws.",
  nationality: "Nationality can proxy for race or ethnicity and is a protected characteristic in many jurisdictions.",
  disability: "Disability status is a legally protected attribute and its inclusion is rarely justified.",
};
const SENSITIVE_FIELDS = new Set([
  "gender","sex","gender_identity","biological_sex","male","female","is_male","is_female",
  "age","dob","date_of_birth","birth_date","birthdate","birth_year","year_of_birth","age_group","age_band",
  "race","ethnicity","ethnic_group","ethnic_background","race_ethnicity","racial_group",
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
]);

function getBiasReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return BIAS_REASONS[k] ?? `"${f}" may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.`;
}
function getMediumRiskReason(f: string) {
  const k = f.toLowerCase().replace(/[^a-z_]/g, "");
  return MEDIUM_RISK_REASONS[k] ?? `"${f}" is a known sensitive or protected attribute. Even a low Pearson score in this sample doesn't guarantee it won't introduce bias in production.`;
}
function isSensitive(f: string): boolean {
  return SENSITIVE_FIELDS.has(f.toLowerCase().replace(/[^a-z_]/g, ""));
}

// ── Heatmap colour helper: white (0) → deep red (1) ───────────────────────
function corrToColor(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return `rgb(255,${Math.round(255 - c * 215)},${Math.round(255 - c * 215)})`;
}

// ── PDF generation (3 pages) ───────────────────────────────────────────────
function generatePDF(
  fileName: string,
  results: AuditResult[],
  currentTarget: string,
  threshold: number,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 15, CW = W - M * 2;
  const flagged = results.filter(r => r.risk === "high");
  const medium  = results.filter(r => r.risk === "medium");
  const safe    = results.filter(r => r.risk === "low");
  const today   = new Date().toLocaleDateString("en-US", { dateStyle: "long" });

  // ── PAGE 1: Executive Summary ──────────────────────────────────────────
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, W, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont("helvetica", "bold");
  doc.text("AI Bias & Proxy Variable", M, 17);
  doc.text("Audit Report", M, 27);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`${today}  ·  Dataset: ${fileName}  ·  Target: ${currentTarget}`, M, 36);

  // Stat boxes
  const bW = (CW - 8) / 3, bY = 50;
  const boxes: { count: number; label: string; bg: [number,number,number]; fg: [number,number,number] }[] = [
    { count: flagged.length, label: "High Risk",   bg: [254,242,242], fg: [185,28,28] },
    { count: medium.length,  label: "Medium Risk",  bg: [255,251,235], fg: [146,64,14] },
    { count: safe.length,    label: "Safe",          bg: [240,253,244], fg: [21,128,61] },
  ];
  boxes.forEach((b, i) => {
    const bX = M + i * (bW + 4);
    doc.setFillColor(...b.bg); doc.roundedRect(bX, bY, bW, 22, 2, 2, "F");
    doc.setTextColor(...b.fg);
    doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text(String(b.count), bX + bW / 2, bY + 13, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(b.label, bX + bW / 2, bY + 19, { align: "center" });
  });

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("Overview", M, bY + 32);
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  doc.text(
    `This report audits ${results.length} feature${results.length !== 1 ? "s" : ""} in "${fileName}" against the target "${currentTarget}" using four bias-detection signals: Pearson Correlation (linear associations), Mutual Information (non-linear associations), Group Disparity (outcome rate gaps between groups), and Sensitive Attribute Detection (known protected attributes flagged regardless of score). Risk threshold: ${threshold.toFixed(2)}.`,
    M, bY + 40, { maxWidth: CW }
  );

  // Proxy variable explainer box
  const pY = bY + 68;
  doc.setFillColor(238, 242, 255); doc.roundedRect(M, pY, CW, 40, 2, 2, "F");
  doc.setTextColor(67, 56, 202);
  doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("What is a Proxy Variable?", M + 4, pY + 8);
  doc.setTextColor(55, 48, 163); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(
    "A proxy variable is a feature that doesn't directly measure a protected characteristic (such as race or gender) but is correlated with one. For example, ZIP code can act as a proxy for race due to historical residential segregation. When an AI model trains on proxy variables it can learn to discriminate indirectly — even if the protected attribute was never explicitly included in the dataset. Other common examples: last name → ethnicity, parental status → gender, neighbourhood → income/race, criminal record → race.",
    M + 4, pY + 15, { maxWidth: CW - 8 }
  );

  // Detection methods
  const dmY = pY + 50;
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Detection Methods Used", M, dmY);
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  [
    ["1. Pearson Correlation", "Measures the strength of a linear relationship between a feature and the target outcome."],
    ["2. Mutual Information", "Quantifies all statistical dependencies — including non-linear ones Pearson would miss — in bits."],
    ["3. Group Disparity", "For categorical features (≤10 unique values), measures the outcome rate gap between groups."],
    ["4. Sensitive Attribute Detection", "Flags columns whose names match known protected or proxy attributes regardless of statistical scores."],
  ].forEach(([title, desc], i) => {
    doc.setFont("helvetica", "bold");
    doc.text(title + ":", M + 3, dmY + 8 + i * 12);
    doc.setFont("helvetica", "normal");
    doc.text(desc, M + 3, dmY + 13 + i * 12, { maxWidth: CW - 6 });
  });

  // ── PAGE 2: Feature Risk Table ─────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("Feature Risk Analysis", M, 12);

  const hY = 26;
  doc.setFillColor(243, 244, 246); doc.rect(M, hY, CW, 8, "F");
  doc.setTextColor(80, 80, 80); doc.setFontSize(8); doc.setFont("helvetica", "bold");
  const cols = [
    { l: "Feature",    x: M + 2,   },
    { l: "Risk",       x: M + 44,  },
    { l: "Pearson r",  x: M + 68,  },
    { l: "MI (bits)",  x: M + 90,  },
    { l: "Disparity",  x: M + 112, },
    { l: "Top Signal", x: M + 134, },
  ];
  cols.forEach(h => doc.text(h.l, h.x, hY + 5.5));

  let rY = hY + 8;
  results.forEach(r => {
    const bg: [number,number,number] = r.risk === "high" ? [254,242,242] : r.risk === "medium" ? [255,251,235] : [255,255,255];
    doc.setFillColor(...bg); doc.rect(M, rY, CW, 7, "F");
    const fg: [number,number,number] = r.risk === "high" ? [185,28,28] : r.risk === "medium" ? [146,64,14] : [55,65,81];
    doc.setTextColor(...fg); doc.setFont("helvetica", r.risk !== "low" ? "bold" : "normal"); doc.setFontSize(8);
    doc.text(r.name.slice(0, 22), cols[0].x, rY + 5);
    doc.text(r.risk === "high" ? "HIGH" : r.risk === "medium" ? "MEDIUM" : "LOW", cols[1].x, rY + 5);
    doc.setTextColor(60, 60, 60); doc.setFont("helvetica", "normal");
    doc.text(r.corr.toFixed(2), cols[2].x, rY + 5);
    doc.text(r.mi.toFixed(2), cols[3].x, rY + 5);
    doc.text(r.disp != null ? `${(r.disp * 100).toFixed(0)}%` : "N/A", cols[4].x, rY + 5);
    doc.text((r.triggers[0] ?? "—").slice(0, 32), cols[5].x, rY + 5);
    doc.setDrawColor(220, 220, 220); doc.line(M, rY + 7, M + CW, rY + 7);
    rY += 7;
    if (rY > 270) { doc.addPage(); rY = 20; }
  });

  // ── PAGE 3: Recommendations ────────────────────────────────────────────
  doc.addPage();
  doc.setFillColor(79, 70, 229); doc.rect(0, 0, W, 18, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(13); doc.setFont("helvetica", "bold");
  doc.text("Recommendations", M, 12);

  let recY = 28;
  if (flagged.length > 0) {
    doc.setTextColor(185, 28, 28); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("High Risk — Immediate Action Required", M, recY); recY += 7;
    flagged.forEach(r => {
      doc.setFillColor(254, 242, 242); doc.roundedRect(M, recY, CW, 20, 2, 2, "F");
      doc.setTextColor(185, 28, 28); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${r.name}  (r=${r.corr.toFixed(2)}, MI=${r.mi.toFixed(2)} bits)`, M + 3, recY + 7);
      doc.setTextColor(100, 20, 20); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("Remove or replace this feature. If retention is essential, apply fairness constraints and document the justification in your Model Card.", M + 3, recY + 14, { maxWidth: CW - 6 });
      recY += 24;
    });
  }
  if (medium.length > 0) {
    recY += 3;
    doc.setTextColor(146, 64, 14); doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("Medium Risk — Review Carefully", M, recY); recY += 7;
    medium.forEach(r => {
      doc.setFillColor(255, 251, 235); doc.roundedRect(M, recY, CW, 20, 2, 2, "F");
      doc.setTextColor(146, 64, 14); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(`${r.name}  (r=${r.corr.toFixed(2)}, MI=${r.mi.toFixed(2)} bits)`, M + 3, recY + 7);
      doc.setTextColor(100, 60, 10); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
      doc.text("Evaluate whether this feature is strictly necessary. If retained, test for disparate impact and apply bias mitigation techniques.", M + 3, recY + 14, { maxWidth: CW - 6 });
      recY += 24;
    });
  }
  recY += 4;
  doc.setTextColor(30, 30, 30); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("General Best Practices", M, recY); recY += 7;
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(60, 60, 60);
  [
    "Run demographic parity, equalized odds, and calibration checks before deploying any model trained on this data.",
    "Establish a fairness testing pipeline that runs automatically on every model retrain — bias can re-enter via data drift.",
    "Document all feature inclusion decisions in a Model Card or Datasheets for Datasets.",
    "Have a diverse team review dataset and model outputs before production deployment.",
    "Re-audit whenever the source population, data collection process, or target definition changes.",
    "Consider fairness-aware algorithms (reweighing, adversarial debiasing) for high-stakes decisions.",
  ].forEach(rec => {
    doc.text(`• ${rec}`, M + 3, recY, { maxWidth: CW - 3 }); recY += 9;
  });

  // Footer on all pages
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(160, 160, 160);
    doc.text(`AI Bias Auditor  ·  Page ${i} of ${pages}  ·  ${today}`, W / 2, 287, { align: "center" });
  }
  doc.save(`bias-audit-${fileName.replace(".csv", "").replace(/[^a-z0-9]/gi, "_")}.pdf`);
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
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-indigo-50/60 transition-colors"
      >
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
            <h3 className="text-sm font-bold text-indigo-800 mb-2">🛡️ What Does This Tool Do?</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              This auditor scans your CSV dataset <strong>before you train a model</strong> and flags features that may introduce unfair bias, using four detection signals:
            </p>
            <ul className="mt-2 space-y-2">
              {[
                ["📐 Pearson Correlation", "Linear statistical link between feature and outcome"],
                ["🔗 Mutual Information", "Non-linear associations Pearson would miss"],
                ["⚖️ Group Disparity", "Outcome rate gaps between groups in categorical features"],
                ["🏷️ Protected Attribute", "Column name matches a known sensitive attribute"],
              ].map(([t, d]) => (
                <li key={t as string} className="text-xs text-gray-600 flex gap-2">
                  <span className="font-semibold shrink-0">{t as string}:</span>
                  <span>{d as string}</span>
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
  const matrix = useMemo(() =>
    cols.map(colA =>
      cols.map(colB => {
        if (colA === colB) return 1;
        const xs = data.rows.map(r => r[colA] as number);
        const ys = data.rows.map(r => r[colB] as number);
        return pearson(xs, ys);
      })
    ), [data, cols]);

  const cellSz = Math.min(66, Math.max(38, Math.floor(500 / Math.max(cols.length, 1))));
  const labelW = 82;

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-800 mb-0.5">Correlation Heatmap</h3>
      <p className="text-xs text-gray-500 mb-3">Pearson correlation between every pair of numeric features. Darker red = stronger association. Indigo diagonal = self-correlation (always 1.0).</p>
      <div className="overflow-auto">
        <div className="inline-flex flex-col">
          {/* Column labels */}
          <div className="flex" style={{ marginLeft: labelW }}>
            {cols.map(col => (
              <div key={col} style={{ width: cellSz, minWidth: cellSz }} className="text-center px-0.5">
                <span className="text-xs text-gray-500 block truncate" title={col}>{col.slice(0, 8)}</span>
              </div>
            ))}
          </div>
          {/* Matrix rows */}
          {matrix.map((row, i) => (
            <div key={cols[i]} className="flex items-center">
              <div style={{ width: labelW, minWidth: labelW }} className="text-xs text-gray-600 truncate pr-2 text-right shrink-0" title={cols[i]}>
                {cols[i].slice(0, 11)}
              </div>
              {row.map((val, j) => (
                <div
                  key={j}
                  style={{
                    width: cellSz, height: cellSz, minWidth: cellSz,
                    backgroundColor: i === j ? "#4f46e5" : corrToColor(val),
                    border: "1px solid #e5e7eb",
                  }}
                  className="flex items-center justify-center cursor-default"
                  title={`${cols[i]} × ${cols[j]}: ${val.toFixed(3)}`}
                >
                  <span style={{ color: (i === j || val > 0.55) ? "#fff" : "#374151", fontSize: cellSz < 46 ? "9px" : "11px" }} className="font-mono font-bold">
                    {val.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs text-gray-400">Low</span>
          <div className="flex h-3 rounded overflow-hidden" style={{ width: 120 }}>
            {Array.from({ length: 12 }, (_, k) => (
              <div key={k} style={{ flex: 1, backgroundColor: corrToColor(k / 11) }} />
            ))}
          </div>
          <span className="text-xs text-gray-400">High</span>
          <div className="w-5 h-3 rounded ml-4" style={{ backgroundColor: "#4f46e5" }} />
          <span className="text-xs text-gray-400">Self (diagonal)</span>
        </div>
      </div>
    </div>
  );
}

// ── Feature Risk Chart (grouped horizontal bars) ───────────────────────────
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
        Three bias-detection scores for each feature vs. <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>. Pearson r bar is colour-coded by risk level.
      </p>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 56)}>
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 32, left: 8, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
          <XAxis type="number" domain={[0, 1]} tick={{ fontSize: 10 }} tickFormatter={v => v.toFixed(1)} />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v: number, name: string) => [v.toFixed(3), name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          {(["Pearson r", "MI (bits)", "Disparity"] as const).map(key => (
            <Bar key={key} dataKey={key} fill={SIG_COLORS[key]} radius={[0, 4, 4, 0]} name={key}>
              {data.map(d => (
                <Cell
                  key={d.name}
                  fill={key === "Pearson r" ? riskFill[d.risk] : SIG_COLORS[key]}
                  fillOpacity={key === "Pearson r" ? 1 : 0.55}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-5 mt-2 justify-center flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Pearson r colour:</span>
        {[["🔴 High risk", "#dc2626"], ["🟡 Medium risk", "#f59e0b"], ["🟢 Low risk", "#10b981"]].map(([l, c]) => (
          <div key={l as string} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c as string }} />{l as string}
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-2 font-medium">Others:</span>
        {[["MI (bits)", "#f59e0b"], ["Disparity", "#ef4444"]].map(([l, c]) => (
          <div key={l as string} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm opacity-55" style={{ backgroundColor: c as string }} />{l as string}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function AuditorRerun() {
  const [data, setData]           = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol] = useState("approved");
  const [threshold, setThreshold] = useState(0.75);
  const [activeTab, setActiveTab] = useState<"audit" | "viz" | "report" | "preview">("audit");
  const [targetOpen, setTargetOpen] = useState(false);
  const [dragging, setDragging]   = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [running, setRunning]     = useState(false);
  const [runKey, setRunKey]       = useState(0);
  const [showInfo, setShowInfo]   = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeData = data ?? loadSample();
  const numCols = activeData.numericColumns;
  const currentTarget = numCols.includes(targetCol) ? targetCol : numCols[numCols.length - 1];

  const results: AuditResult[] = useMemo(() =>
    numCols.filter(c => c !== currentTarget).map(name => {
      const xs = activeData.rows.map(r => r[name] as number);
      const ys = activeData.rows.map(r => r[currentTarget] as number);
      const corr = pearson(xs, ys);
      const mi   = mutualInformation(xs, ys);
      const disp = disparityScore(xs, ys);
      const triggers: string[] = [];
      let risk: "high" | "medium" | "low" = "low";
      if (corr >= threshold)           { triggers.push(`Pearson r = ${corr.toFixed(2)} — strong linear correlation (above ${threshold.toFixed(2)} threshold)`); risk = "high"; }
      else if (corr >= threshold*0.65) { triggers.push(`Pearson r = ${corr.toFixed(2)} — moderate linear correlation`); if (risk==="low") risk="medium"; }
      if (mi >= MI_HIGH)               { triggers.push(`Mutual Information = ${mi.toFixed(2)} bits — strong non-linear association missed by Pearson`); if (risk!=="high") risk="high"; }
      else if (mi >= MI_MED)           { triggers.push(`Mutual Information = ${mi.toFixed(2)} bits — moderate non-linear association`); if (risk==="low") risk="medium"; }
      if (disp !== null && disp >= DISP_HIGH) { triggers.push(`Group disparity = ${(disp*100).toFixed(0)}% — large outcome rate gap between value groups`); if (risk!=="high") risk="high"; }
      else if (disp !== null && disp >= DISP_MED) { triggers.push(`Group disparity = ${(disp*100).toFixed(0)}% — notable outcome rate gap between value groups`); if (risk==="low") risk="medium"; }
      if (isSensitive(name))           { triggers.push(`"${name}" is a known protected or sensitive attribute — risky regardless of correlation score`); if (risk==="low") risk="medium"; }
      return { name, corr, mi, disp, risk, triggers };
    }).sort((a, b) => b.corr - a.corr),
  [activeData, numCols, currentTarget, threshold]);

  const flagged = useMemo(() => results.filter(r => r.risk === "high"),  [results]);
  const medium  = useMemo(() => results.filter(r => r.risk === "medium"), [results]);
  const safe    = useMemo(() => results.filter(r => r.risk === "low"),   [results]);

  const recs = useMemo(() => {
    const out: string[] = [];
    flagged.forEach(r => out.push(`Remove or replace "${r.name}" — it has a strong statistical association with the target (r=${r.corr.toFixed(2)}).`));
    medium.forEach(r => out.push(`Review "${r.name}" carefully — it is a sensitive or protected attribute. Evaluate whether it is strictly necessary.`));
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
      const { columns, rows } = parseCSV(e.target?.result as string);
      const nc = numericCols(columns, rows);
      if (nc.length < 2) { setUploadError("Need at least 2 numeric columns."); return; }
      setData({ columns, rows, fileName: file.name, numericColumns: nc });
      setTargetCol(nc[nc.length - 1]);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const TABS = [
    { id: "audit",   label: "🔍 Audit Results"    },
    { id: "viz",     label: "📊 Visualizations"    },
    { id: "report",  label: "📋 Download Report"   },
    { id: "preview", label: "🗂️ Data Preview"      },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">

      {/* ── Topbar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800 hidden sm:block">AI Bias Auditor</span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <button
          onClick={handleRerun} disabled={running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-all ${running ? "bg-indigo-400 text-white cursor-wait" : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"}`}
        >
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
        <button
          onClick={() => generatePDF(activeData.fileName, results, currentTarget, threshold)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" /> Export PDF
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
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
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
                <button onClick={() => { setData(loadSample()); setTargetCol("approved"); }} className="mt-2 w-full text-xs text-center text-gray-400 hover:text-indigo-600 transition-colors py-1">
                  or load sample dataset →
                </button>
              </>
            )}
            {uploadError && <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{uploadError}</p>}
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          <div className="px-4 pt-5 flex-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>
            {numCols.length >= 2 && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Target variable</label>
                  <div className="relative">
                    <button onClick={() => setTargetOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors">
                      <span className="truncate">{currentTarget}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${targetOpen ? "rotate-180" : ""}`} />
                    </button>
                    {targetOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        {numCols.map(col => (
                          <button key={col} onClick={() => { setTargetCol(col); setTargetOpen(false); }} className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-indigo-50 transition-colors ${col === currentTarget ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}>{col}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-gray-600">Risk Threshold</label>
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{threshold.toFixed(2)}</span>
                  </div>
                  <input type="range" min={0.5} max={1.0} step={0.05} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-indigo-600 cursor-pointer" />
                  <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>0.50</span><span>1.00</span></div>
                </div>
              </div>
            )}
          </div>

          {numCols.length >= 2 && (
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
                        <p className="text-sm font-bold text-emerald-800">🎉 No extreme correlations found!</p>
                        <p className="text-sm text-emerald-700 mt-0.5">Your dataset appears to be free of hidden biases at threshold {threshold.toFixed(2)}.</p>
                      </div>
                    </div>
                  )}
                  {!running && results.map((r) => {
                    const cardBg    = r.risk === "high" ? "bg-red-50 border-red-200" : r.risk === "medium" ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200";
                    const codeBg    = r.risk === "high" ? "bg-red-100 text-red-800"  : r.risk === "medium" ? "bg-amber-100 text-amber-800"  : "bg-gray-100 text-gray-800";
                    const sigColor  = r.risk === "high" ? "text-red-600 bg-red-50 border-red-200" : r.risk === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-500 bg-gray-50 border-gray-200";
                    return (
                      <div key={r.name} className={`rounded-xl border p-4 shadow-sm ${cardBg}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.risk === "high"   && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5" /> HIGH RISK</span>}
                          {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600"><AlertCircle className="w-3.5 h-3.5" /> MEDIUM RISK</span>}
                          {r.risk === "low"    && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> LOW RISK</span>}
                          <span className="text-xs text-gray-400">|</span>
                          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${codeBg}`}>{r.name}</code>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${sigColor}`}>Pearson r = {r.corr.toFixed(2)}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.mi >= MI_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.mi >= MI_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-400 bg-gray-50 border-gray-200"}`}>MI = {r.mi.toFixed(2)} bits</span>
                          {r.disp !== null && <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${r.disp >= DISP_HIGH ? "text-red-600 bg-red-50 border-red-200" : r.disp >= DISP_MED ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-400 bg-gray-50 border-gray-200"}`}>Disparity = {(r.disp * 100).toFixed(0)}%</span>}
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
                  {!data && !running && (
                    <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                      <Info className="w-4 h-4 mt-0.5 shrink-0" />
                      <span><strong>Getting Started:</strong> Upload a dataset in the sidebar to begin your audit.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Visualizations ─────────────────────────────────────────── */}
              {activeTab === "viz" && (
                <div className="p-5 space-y-8">
                  {numCols.length >= 2 ? (
                    <>
                      <FeatureRiskChart results={results} currentTarget={currentTarget} />
                      <div className="border-t border-gray-100 pt-6">
                        <CorrelationHeatmap data={activeData} cols={numCols} />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-8 text-gray-400">
                      <BarChart2 className="w-8 h-8 shrink-0" />
                      <p className="text-sm">Upload a dataset with at least 2 numeric columns to see visualizations.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Download Report ────────────────────────────────────────── */}
              {activeTab === "report" && (
                <div className="p-5 space-y-4">
                  {/* CTA */}
                  <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                      <FileDown className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white">Download Full PDF Report</h3>
                      <p className="text-xs text-indigo-200 mt-0.5">3-page report: Executive Summary · Feature Risk Table · Recommendations</p>
                    </div>
                    <button
                      onClick={() => generatePDF(activeData.fileName, results, currentTarget, threshold)}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50 active:scale-95 transition-all shrink-0"
                    >
                      <Download className="w-4 h-4" /> Download PDF
                    </button>
                  </div>

                  {/* Executive summary */}
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5">
                      <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">📄 Executive Summary</span>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-red-600">{flagged.length}</div>
                          <div className="text-xs text-red-500 font-medium mt-0.5">High Risk Features</div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-amber-500">{medium.length}</div>
                          <div className="text-xs text-amber-500 font-medium mt-0.5">Medium Risk Features</div>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                          <div className="text-3xl font-bold text-emerald-600">{safe.length}</div>
                          <div className="text-xs text-emerald-500 font-medium mt-0.5">Safe Features</div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Audited <strong>{results.length} feature{results.length !== 1 ? "s" : ""}</strong> in <strong>{activeData.fileName}</strong> against target <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code> using Pearson Correlation, Mutual Information, Group Disparity, and Sensitive Attribute Detection.
                        {flagged.length > 0 && <span className="text-red-700 font-medium"> {flagged.length} feature{flagged.length > 1 ? "s require" : " requires"} immediate action.</span>}
                        {medium.length > 0 && <span className="text-amber-700 font-medium"> {medium.length} feature{medium.length > 1 ? "s need" : " needs"} careful review.</span>}
                        {flagged.length === 0 && medium.length === 0 && <span className="text-emerald-700 font-medium"> No features require action at the current threshold.</span>}
                      </p>
                    </div>
                  </div>

                  {/* Flagged variables */}
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
                            <div className="flex items-center gap-3 ml-auto text-xs text-gray-400 font-mono">
                              <span>r={r.corr.toFixed(2)}</span>
                              <span>MI={r.mi.toFixed(2)}</span>
                              {r.disp != null && <span>Δ={( r.disp*100).toFixed(0)}%</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
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

              {/* ── Data Preview ───────────────────────────────────────────── */}
              {activeTab === "preview" && (
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4 text-sm text-gray-600">
                    <span>Rows: <strong className="text-gray-900">{activeData.rows.length}</strong></span>
                    <span className="text-gray-300">·</span>
                    <span>Columns: <strong className="text-gray-900">{activeData.columns.length}</strong></span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {activeData.columns.map(col => (
                            <th key={col} className={`px-3 py-2.5 text-left font-bold ${col === currentTarget ? "text-indigo-600" : "text-gray-600"}`}>
                              <code>{col}</code>{col === currentTarget && <span className="ml-1 text-indigo-400 font-normal">(target)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.rows.slice(0, 10).map((row, i) => (
                          <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            {activeData.columns.map(col => (
                              <td key={col} className={`px-3 py-2 font-mono ${col === currentTarget ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>{String(row[col])}</td>
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
