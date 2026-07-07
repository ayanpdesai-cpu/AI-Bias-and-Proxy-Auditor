import { useState, useRef, useCallback } from "react";
import {
  Shield, Upload, AlertTriangle, CheckCircle, Info,
  X, RefreshCw, FileText, ChevronDown, Download
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface ParsedData {
  columns: string[];
  rows: Record<string, number | string>[];
  fileName: string;
  numericColumns: string[];
}

// ── CSV / Math helpers ───────────────────────────────────────────────────────
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
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : Math.abs(num / denom);
}

// ── Sample data (mirrors what app.py produces with this CSV) ─────────────────
const SAMPLE_CSV = `coding_score,zip_code,uses_dark_mode,years_experience,approved
95,10001,1,8,1
42,90210,0,2,0
78,10001,1,6,1
61,30301,0,4,0
88,10001,1,7,1
33,90210,0,1,0
91,10001,1,9,1
55,30301,0,3,0
74,10001,1,5,1
48,90210,0,2,0
85,10001,1,7,1
39,30301,0,1,0`;

function loadSample(): ParsedData {
  const { columns, rows } = parseCSV(SAMPLE_CSV);
  const nc = numericCols(columns, rows);
  return { columns, rows, fileName: "hiring_data.csv", numericColumns: nc };
}

// ── Sub-components ───────────────────────────────────────────────────────────
function CorrelationBar({ value, risk }: { value: number; risk: "high" | "low" }) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            risk === "high"
              ? "bg-gradient-to-r from-red-400 to-red-600"
              : "bg-gradient-to-r from-emerald-400 to-emerald-500"
          }`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">
        {value.toFixed(2)}
      </span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function AuditorResults() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol] = useState("approved");
  const [threshold, setThreshold] = useState(0.75);
  const [activeTab, setActiveTab] = useState<"preview" | "audit">("audit");
  const [targetOpen, setTargetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // derived
  const activeData = data ?? loadSample();
  const numCols = activeData.numericColumns;
  const currentTarget = numCols.includes(targetCol) ? targetCol : numCols[numCols.length - 1];

  const results = numCols
    .filter((c) => c !== currentTarget)
    .map((name) => {
      const xs = activeData.rows.map((r) => r[name] as number);
      const ys = activeData.rows.map((r) => r[currentTarget] as number);
      const corr = pearson(xs, ys);
      return { name, corr, risk: (corr >= threshold ? "high" : "low") as "high" | "low" };
    })
    .sort((a, b) => b.corr - a.corr);

  const flagged = results.filter((r) => r.risk === "high");
  const safe    = results.filter((r) => r.risk === "low");

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
    <div className="min-h-screen bg-slate-50 flex font-['Inter']">

      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0">

        {/* Brand */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">AI Bias Auditor</div>
            <div className="text-xs text-gray-400">Proxy Variable Detector</div>
          </div>
        </div>

        {/* ── Data Input (mirrors st.sidebar.header + st.sidebar.file_uploader) */}
        <div className="px-4 pt-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Data Input</p>

          {data ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-emerald-800 truncate">{data.fileName}</div>
                  <div className="text-xs text-emerald-600">{data.rows.length} rows · {data.columns.length} cols</div>
                </div>
                <button onClick={() => { setData(null); setTargetCol("approved"); }} className="text-emerald-400 hover:text-emerald-700 transition-colors" title="Remove">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 py-1 font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Replace file
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
                dragging ? "border-indigo-400 bg-indigo-100" : "border-indigo-200 bg-indigo-50 hover:border-indigo-400 hover:bg-indigo-100"
              }`}
            >
              <Upload className="w-5 h-5 text-indigo-500" />
              <div className="text-center">
                <div className="text-xs font-semibold text-indigo-700">Upload a CSV file</div>
                <div className="text-xs text-indigo-400 mt-0.5">or drag & drop</div>
              </div>
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {uploadError}
            </p>
          )}

          {!data && (
            <button
              onClick={() => { setData(loadSample()); setTargetCol("approved"); }}
              className="mt-2 w-full text-xs text-center text-gray-400 hover:text-indigo-600 transition-colors py-1"
            >
              or load sample dataset →
            </button>
          )}

          <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        {/* ── Configure Audit (mirrors col2 in app.py) */}
        <div className="px-4 pt-5 flex-1">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>

          {numCols.length < 2 ? (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              At least two numeric columns are required for correlation analysis.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Target column selector */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Select the target variable<br />
                  <span className="text-gray-400 font-normal">(e.g. 'Approved', 'Hired')</span>
                </label>
                <div className="relative">
                  <button
                    onClick={() => setTargetOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors"
                  >
                    <span className="truncate">{currentTarget}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${targetOpen ? "rotate-180" : ""}`} />
                  </button>
                  {targetOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {numCols.map((col) => (
                        <button
                          key={col}
                          onClick={() => { setTargetCol(col); setTargetOpen(false); }}
                          className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-indigo-50 transition-colors ${col === currentTarget ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}
                        >
                          {col}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Threshold slider — mirrors st.slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">Risk Threshold</label>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{threshold.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0.5} max={1.0} step={0.05}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0.50</span><span>1.00</span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                  Features correlating higher than this with your target will be flagged as high risk.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Flagged / Safe counts */}
        {numCols.length >= 2 && (
          <div className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-50 border border-red-100 rounded-xl p-2.5 text-center">
                <div className="text-2xl font-bold text-red-600">{flagged.length}</div>
                <div className="text-xs text-red-500 font-medium">Flagged</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                <div className="text-2xl font-bold text-emerald-600">{safe.length}</div>
                <div className="text-xs text-emerald-500 font-medium">Safe</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">

        {/* Header — mirrors st.title + st.markdown */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">🛡️ AI Bias & Proxy Variable Auditor</h1>
              <p className="text-sm text-gray-500 mt-0.5 max-w-xl">
                This tool audits datasets to find <strong>Hidden Biases</strong> and{" "}
                <strong>Proxy Variables</strong> before they are used to train AI models.
                Drop a CSV file to check for feature correlations and data anomalies.
              </p>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0 mt-1">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 space-y-6 max-w-4xl">

            {/* ── Tabs (Data Preview / Audit Results — mirrors app.py sections) */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex border-b border-gray-200">
                {(["preview", "audit"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-5 py-3 text-xs font-semibold transition-colors border-b-2 ${
                      activeTab === t
                        ? "border-indigo-600 text-indigo-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {t === "preview" ? "📊 Data Preview" : "🔍 Audit Results & Risk Analysis"}
                  </button>
                ))}
              </div>

              {/* ── Data Preview tab — mirrors st.subheader + st.dataframe */}
              {activeTab === "preview" && (
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="text-sm text-gray-600">
                      Number of rows: <span className="font-bold text-gray-900">{activeData.rows.length}</span>
                    </div>
                    <span className="text-gray-300">·</span>
                    <div className="text-sm text-gray-600">
                      Number of columns: <span className="font-bold text-gray-900">{activeData.columns.length}</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {activeData.columns.map((col) => (
                            <th key={col} className={`px-3 py-2.5 text-left font-bold ${col === currentTarget ? "text-indigo-600" : "text-gray-600"}`}>
                              <code>{col}</code>
                              {col === currentTarget && <span className="ml-1 text-indigo-400 font-normal">(target)</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeData.rows.slice(0, 10).map((row, i) => (
                          <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                            {activeData.columns.map((col) => (
                              <td key={col} className={`px-3 py-2 font-mono ${col === currentTarget ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>
                                {String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {activeData.rows.length > 10 && (
                    <p className="mt-2 text-xs text-gray-400 text-center">Showing first 10 of {activeData.rows.length} rows</p>
                  )}
                </div>
              )}

              {/* ── Audit Results tab — mirrors the for-loop output in app.py */}
              {activeTab === "audit" && (
                <div className="p-5 space-y-4">

                  {numCols.length < 2 && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      At least two numeric columns are required for correlation analysis.
                    </div>
                  )}

                  {numCols.length >= 2 && results.length === 0 && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                      <Info className="w-4 h-4 shrink-0" />
                      No numeric columns available for correlation analysis.
                    </div>
                  )}

                  {/* No flags — mirrors st.balloons + st.info */}
                  {numCols.length >= 2 && results.length > 0 && flagged.length === 0 && (
                    <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-800">🎉 No extreme correlations found!</p>
                        <p className="text-sm text-emerald-700 mt-0.5">
                          Your dataset appears to be free of hidden biases at threshold {threshold.toFixed(2)}.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Feature list — mirrors the for-loop st.error / st.success */}
                  {results.map((r) => (
                    <div
                      key={r.name}
                      className={`rounded-xl border p-4 shadow-sm ${
                        r.risk === "high"
                          ? "bg-red-50 border-red-200"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.risk === "high" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                              <AlertTriangle className="w-3.5 h-3.5" /> High Risk!
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <CheckCircle className="w-3.5 h-3.5" /> LOW RISK
                            </span>
                          )}
                          <span className="text-xs text-gray-500">| Feature</span>
                          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${r.risk === "high" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"}`}>
                            {r.name}
                          </code>
                          <span className="text-xs text-gray-500">
                            has a {r.risk === "high" ? "" : "safe "}correlation of{" "}
                            <strong>{r.corr.toFixed(2)}</strong> with{" "}
                            <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{currentTarget}</code>
                          </span>
                        </div>
                      </div>
                      <CorrelationBar value={r.corr} risk={r.risk} />
                      {r.risk === "high" && (
                        <p className="text-xs text-red-700 mt-2.5 leading-relaxed bg-red-100 rounded-lg px-3 py-2">
                          <span className="font-semibold">Why this matters:</span>{" "}
                          This feature strongly dictates the AI's behavior. If{" "}
                          <code className="font-mono">{r.name}</code> is a biased or irrelevant metric,
                          the model will learn an unfair shortcut rule.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Empty upload state — mirrors the else branch in app.py */}
            {!data && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span><strong>Getting Started:</strong> Upload a dataset in the sidebar to begin your audit. Don't have one? See the example below.</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Example Dataset Layout</h3>
                <p className="text-xs text-gray-500 mb-3">Your CSV should have a structure like this:</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {["coding_score", "zip_code", "uses_dark_mode", "approved"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[[95, 10001, 1, 1], [42, 90210, 0, 0], [78, 10001, 1, 1]].map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                          {row.map((v, j) => <td key={j} className="px-3 py-2 text-gray-700">{v}</td>)}
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
  );
}
