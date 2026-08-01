import { useState, useRef, useCallback } from "react";
import {
  Shield, Upload, AlertTriangle, CheckCircle, Info,
  X, RefreshCw, FileText, ChevronDown, Download, Play, AlertCircle
} from "lucide-react";

interface ParsedData {
  columns: string[];
  rows: Record<string, number | string>[];
  fileName: string;
  numericColumns: string[];
}

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

const SAMPLE_CSV = `coding_score,zip_code,uses_dark_mode,years_experience,approved
95,10001,1,8,1
42,90210,0,2,0
78,10001,1,6,1
61,30301,0,4,0
88,10001,1,7,1
33,90210,0,1,0
91,10001,1,9,1
55,30301,0,3,0`;

function loadSample(): ParsedData {
  const { columns, rows } = parseCSV(SAMPLE_CSV);
  const nc = numericCols(columns, rows);
  return { columns, rows, fileName: "hiring_data.csv", numericColumns: nc };
}

const BIAS_REASONS: Record<string, string> = {
  zip_code:      "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  zipcode:       "ZIP codes strongly correlate with race and income — they can silently encode redlining-era discrimination.",
  gender:        "Gender is a protected attribute; including it can directly discriminate against applicants.",
  age:           "Age is a protected attribute and can disadvantage older or younger candidates.",
  race:          "Race is a protected attribute — using it is directly discriminatory.",
  ethnicity:     "Ethnicity is a protected attribute — using it is directly discriminatory.",
  uses_dark_mode:"Superficial personal preferences can act as unexpected proxies for demographic groups.",
  dark_mode:     "Superficial personal preferences can act as unexpected proxies for demographic groups.",
  name:          "Names can reveal ethnicity or gender and introduce cultural or demographic bias.",
  address:       "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
  income:        "Income correlates with race, gender, and class — it can amplify existing societal inequalities.",
};

function getBiasReason(feature: string): string {
  const key = feature.toLowerCase().replace(/[^a-z_]/g, "");
  return BIAS_REASONS[key]
    ?? `"${feature}" may carry hidden demographic signal — check whether it reflects genuine merit or encodes group membership.`;
}

// Fields that are inherently sensitive regardless of measured correlation.
// Low correlation in one dataset does NOT make them safe to include.
const SENSITIVE_FIELDS = new Set([
  "gender", "sex", "age", "race", "ethnicity", "religion", "nationality",
  "disability", "marital_status", "has_a_child", "children", "num_children",
  "pregnant", "pregnancy", "zip_code", "zipcode", "postcode", "postal_code",
  "name", "first_name", "last_name", "surname", "address", "income",
  "household_income", "net_worth", "criminal_record", "arrest_history",
]);

const MEDIUM_RISK_REASONS: Record<string, string> = {
  has_a_child:    "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  children:       "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  num_children:   "Parental status disproportionately impacts women and can act as a proxy for gender discrimination.",
  marital_status: "Marital status intersects with gender and can lead to indirect discrimination against women or LGBTQ+ applicants.",
  pregnant:       "Pregnancy status is a legally protected characteristic in many jurisdictions.",
  pregnancy:      "Pregnancy status is a legally protected characteristic in many jurisdictions.",
  criminal_record:"Criminal records correlate heavily with race and socioeconomic background — inclusion can encode systemic biases.",
  arrest_history: "Arrest history (without conviction) strongly correlates with race and should almost never be used as a feature.",
  income:         "Income correlates with race, gender, and class — even a weak measured correlation can mask compounding inequality.",
  name:           "Names can reveal ethnicity or gender to a downstream model even if this dataset's correlation score looks low.",
  first_name:     "First names strongly signal gender and cultural background and can introduce bias that raw correlation misses.",
  last_name:      "Last names can signal ethnicity or national origin and can introduce bias that raw correlation misses.",
  surname:        "Surnames can signal ethnicity or national origin and can introduce bias that raw correlation misses.",
  zip_code:       "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger or differently sampled dataset.",
  zipcode:        "ZIP codes proxy for race and income. Even a low correlation here may not hold in a larger or differently sampled dataset.",
  postcode:       "Postcodes proxy for race and income. Even a low correlation here may not hold in a larger or differently sampled dataset.",
  postal_code:    "Postal codes proxy for race and income. Even a low correlation here may not hold in a larger or differently sampled dataset.",
  address:        "Addresses, like ZIP codes, can proxy for race, income, or neighbourhood demographics.",
  gender:         "Gender is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a gender shortcut.",
  sex:            "Sex is a legally protected attribute. Low correlation in this sample doesn't mean the model won't learn a sex-based shortcut.",
  age:            "Age is a protected attribute. Low correlation now can grow once the model encounters a broader distribution.",
  race:           "Race is directly discriminatory regardless of measured correlation.",
  ethnicity:      "Ethnicity is directly discriminatory regardless of measured correlation.",
  religion:       "Religion is a protected attribute in most anti-discrimination laws.",
  nationality:    "Nationality can proxy for race or ethnicity and is a protected characteristic in many jurisdictions.",
  disability:     "Disability status is a legally protected attribute and its inclusion is rarely justified.",
  household_income:"Household income correlates strongly with race and class; a low value in this sample may not generalise.",
  net_worth:      "Net worth correlates strongly with race and class; a low value in this sample may not generalise.",
};

function getMediumRiskReason(feature: string): string {
  const key = feature.toLowerCase().replace(/[^a-z_]/g, "");
  return MEDIUM_RISK_REASONS[key]
    ?? `"${feature}" is a known sensitive or protected attribute. Even a low Pearson score in this sample doesn't guarantee it won't introduce bias in production.`;
}

function isSensitive(feature: string): boolean {
  return SENSITIVE_FIELDS.has(feature.toLowerCase().replace(/[^a-z_]/g, ""));
}

function CorrelationBar({ value, risk }: { value: number; risk: "high" | "medium" | "low" }) {
  const barColor =
    risk === "high"   ? "bg-gradient-to-r from-red-400 to-red-600" :
    risk === "medium" ? "bg-gradient-to-r from-amber-400 to-orange-400" :
                        "bg-gradient-to-r from-emerald-400 to-emerald-500";
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">{value.toFixed(2)}</span>
    </div>
  );
}

export function AuditorRerun() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol] = useState("approved");
  const [threshold, setThreshold] = useState(0.75);
  const [activeTab, setActiveTab] = useState<"preview" | "audit">("audit");
  const [targetOpen, setTargetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [running, setRunning] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeData = data ?? loadSample();
  const numCols = activeData.numericColumns;
  const currentTarget = numCols.includes(targetCol) ? targetCol : numCols[numCols.length - 1];

  const results = numCols
    .filter((c) => c !== currentTarget)
    .map((name) => {
      const xs = activeData.rows.map((r) => r[name] as number);
      const ys = activeData.rows.map((r) => r[currentTarget] as number);
      const corr = pearson(xs, ys);
      const risk: "high" | "medium" | "low" =
        corr >= threshold ? "high" : isSensitive(name) ? "medium" : "low";
      return { name, corr, risk };
    })
    .sort((a, b) => b.corr - a.corr);

  const flagged = results.filter((r) => r.risk === "high");
  const medium  = results.filter((r) => r.risk === "medium");
  const safe    = results.filter((r) => r.risk === "low");

  const handleRerun = () => {
    setRunning(true);
    setTimeout(() => { setRunning(false); setRunKey((k) => k + 1); }, 900);
  };

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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">

      {/* ── Top bar with prominent Run / Rerun button ─────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
        {/* Brand pill */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800 hidden sm:block">AI Bias Auditor</span>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* ── RUN / RERUN button — prominent, top of screen ── */}
        <button
          onClick={handleRerun}
          disabled={running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-all ${
            running
              ? "bg-indigo-400 text-white cursor-wait"
              : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"
          }`}
        >
          {running ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              Run Audit
            </>
          )}
        </button>

        {/* Reload / re-run shortcut hint */}
        <span className="text-xs text-gray-400 hidden sm:block">
          Re-runs whenever you upload a new file or change settings
        </span>

        <div className="flex-1" />

        {/* File name chip */}
        {data && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700">
            <FileText className="w-3 h-3" />
            {data.fileName}
            <button onClick={() => { setData(null); setTargetCol("approved"); }} className="ml-1 text-emerald-400 hover:text-emerald-700">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">

          {/* Data Input */}
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

          {/* Configure Audit */}
          <div className="px-4 pt-5 flex-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>
            {numCols.length >= 2 && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Target variable</label>
                  <div className="relative">
                    <button onClick={() => setTargetOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors">
                      <span className="truncate">{currentTarget}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${targetOpen ? "rotate-180" : ""}`} />
                    </button>
                    {targetOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        {numCols.map((col) => (
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

          {/* Counts */}
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
          <div className="p-5 space-y-5" key={runKey}>

            {/* Title */}
            <div>
              <h1 className="text-base font-bold text-gray-900">🛡️ AI Bias & Proxy Variable Auditor</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Audits datasets to find <strong>Hidden Biases</strong> and <strong>Proxy Variables</strong> before training AI models.
              </p>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200">
                {(["preview", "audit"] as const).map((t) => (
                  <button key={t} onClick={() => setActiveTab(t)} className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 ${activeTab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                    {t === "preview" ? "📊 Data Preview" : "🔍 Audit Results & Risk Analysis"}
                  </button>
                ))}
              </div>

              {/* Data Preview */}
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
                          {activeData.columns.map((col) => (
                            <th key={col} className={`px-3 py-2.5 text-left font-bold ${col === currentTarget ? "text-indigo-600" : "text-gray-600"}`}>
                              <code>{col}</code>{col === currentTarget && <span className="ml-1 text-indigo-400 font-normal">(target)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.rows.slice(0, 10).map((row, i) => (
                          <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            {activeData.columns.map((col) => (
                              <td key={col} className={`px-3 py-2 font-mono ${col === currentTarget ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>{String(row[col])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Audit Results */}
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
                    const cardBg =
                      r.risk === "high"   ? "bg-red-50 border-red-200" :
                      r.risk === "medium" ? "bg-amber-50 border-amber-200" :
                                            "bg-white border-gray-200";
                    const codeBg =
                      r.risk === "high"   ? "bg-red-100 text-red-800" :
                      r.risk === "medium" ? "bg-amber-100 text-amber-800" :
                                            "bg-gray-100 text-gray-800";
                    return (
                      <div key={r.name} className={`rounded-xl border p-4 shadow-sm ${cardBg}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.risk === "high"   && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5" /> HIGH RISK</span>}
                          {r.risk === "medium" && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600"><AlertCircle className="w-3.5 h-3.5" /> MEDIUM RISK</span>}
                          {r.risk === "low"    && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3.5 h-3.5" /> LOW RISK</span>}
                          <span className="text-xs text-gray-500">| Feature</span>
                          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${codeBg}`}>{r.name}</code>
                          <span className="text-xs text-gray-500">
                            has a {r.risk === "low" ? "safe " : ""}correlation of <strong>{r.corr.toFixed(2)}</strong> with <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>
                            {r.risk === "medium" && <span className="text-amber-600 font-medium"> — low score, but field is sensitive</span>}
                          </span>
                        </div>
                        <CorrelationBar value={r.corr} risk={r.risk} />
                        {r.risk === "high" && (
                          <div className="mt-2.5 space-y-1.5">
                            <p className="text-xs text-red-700 leading-relaxed bg-red-100 rounded-lg px-3 py-2">
                              <span className="font-semibold">Why this matters:</span> This feature strongly dictates the AI's behavior. If <code className="font-mono">{r.name}</code> is a biased or irrelevant metric, the model will learn an unfair shortcut rule.
                            </p>
                            <p className="text-xs text-red-800 leading-relaxed bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                              <span className="font-semibold">Why it may be biased:</span> {getBiasReason(r.name)}
                            </p>
                          </div>
                        )}
                        {r.risk === "medium" && (
                          <div className="mt-2.5 space-y-1.5">
                            <p className="text-xs text-amber-700 leading-relaxed bg-amber-100 rounded-lg px-3 py-2">
                              <span className="font-semibold">Why Pearson correlation alone isn't enough:</span> A low correlation score in this sample does <em>not</em> mean the feature is safe. Sensitive attributes can introduce bias through interaction effects, distributional shift, or a different population in production.
                            </p>
                            <p className="text-xs text-amber-800 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              <span className="font-semibold">Why it may be biased:</span> {getMediumRiskReason(r.name)}
                            </p>
                          </div>
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
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
