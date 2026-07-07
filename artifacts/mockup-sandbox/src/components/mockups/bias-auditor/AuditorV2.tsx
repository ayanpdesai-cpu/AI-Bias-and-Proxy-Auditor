import { useState, useRef, useCallback, useMemo } from "react";
import {
  Shield, Upload, AlertTriangle, CheckCircle, BarChart2,
  FileText, Settings, Info, Zap, X, Download, RefreshCw,
  ChevronDown, Database, TrendingUp, Eye, EyeOff
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
interface ParsedData {
  columns: string[];
  rows: Record<string, string | number>[];
  fileName: string;
  numericColumns: string[];
}

interface FeatureResult {
  name: string;
  correlation: number;
  risk: "high" | "low";
}

// ── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): { columns: string[]; rows: Record<string, string | number>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { columns: [], rows: [] };
  const columns = lines[0].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string | number> = {};
    columns.forEach((col, i) => {
      const num = parseFloat(values[i]);
      row[col] = isNaN(num) ? values[i] ?? "" : num;
    });
    return row;
  });
  return { columns, rows };
}

function numericCols(columns: string[], rows: Record<string, string | number>[]): string[] {
  return columns.filter((col) => rows.slice(0, 20).every((r) => typeof r[col] === "number"));
}

// Pearson correlation
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

// ── Sub-components ───────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: "high" | "low" }) {
  return risk === "high" ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
      <AlertTriangle className="w-3 h-3" /> HIGH RISK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle className="w-3 h-3" /> LOW RISK
    </span>
  );
}

function CorrelationBar({ value, risk }: { value: number; risk: "high" | "low" }) {
  const color = risk === "high"
    ? "bg-gradient-to-r from-red-400 to-red-600"
    : "bg-gradient-to-r from-emerald-400 to-emerald-600";
  return (
    <div className="flex items-center gap-3 w-full mt-2">
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">
        {value.toFixed(3)}
      </span>
    </div>
  );
}

// ── Upload Zone ──────────────────────────────────────────────────────────────
function UploadZone({ onFile }: { onFile: (data: ParsedData) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError("");
    if (!file.name.endsWith(".csv")) {
      setError("Only CSV files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { columns, rows } = parseCSV(text);
      const nc = numericCols(columns, rows);
      if (nc.length < 2) {
        setError("CSV must have at least 2 numeric columns.");
        return;
      }
      onFile({ columns, rows, fileName: file.name, numericColumns: nc });
    };
    reader.readAsText(file);
  }, [onFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200 ${
          dragging
            ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
            : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50"
        }`}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragging ? "bg-indigo-200" : "bg-indigo-100"}`}>
          <Upload className={`w-8 h-8 ${dragging ? "text-indigo-700" : "text-indigo-500"}`} />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-gray-800">
            {dragging ? "Drop your CSV here" : "Upload your dataset"}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Drag & drop or <span className="text-indigo-600 font-medium">browse files</span>
          </p>
          <p className="text-xs text-gray-400 mt-2">CSV format · numeric columns required</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Example hint */}
      <div className="mt-6 max-w-lg w-full bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Example CSV format</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-gray-100">
                {["coding_score", "zip_code", "uses_dark_mode", "approved"].map((h) => (
                  <th key={h} className="px-2 py-1 text-left text-gray-600 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[[95, 10001, 1, 1], [42, 90210, 0, 0], [78, 10001, 1, 1]].map((row, i) => (
                <tr key={i} className="border-b border-gray-50">
                  {row.map((v, j) => <td key={j} className="px-2 py-1 text-gray-700">{v}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export function AuditorV2() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [targetCol, setTargetCol] = useState("");
  const [threshold, setThreshold] = useState(0.75);
  const [activeTab, setActiveTab] = useState<"results" | "data" | "settings">("results");
  const [showAllRows, setShowAllRows] = useState(false);
  const [method, setMethod] = useState("pearson");
  const [targetOpen, setTargetOpen] = useState(false);

  const handleFile = (d: ParsedData) => {
    setData(d);
    setTargetCol(d.numericColumns[d.numericColumns.length - 1]);
    setActiveTab("results");
  };

  const results: FeatureResult[] = useMemo(() => {
    if (!data || !targetCol) return [];
    const target = data.rows.map((r) => r[targetCol] as number);
    return data.numericColumns
      .filter((c) => c !== targetCol)
      .map((name) => {
        const vals = data.rows.map((r) => r[name] as number);
        const correlation = pearson(vals, target);
        return { name, correlation, risk: correlation >= threshold ? "high" : "low" } as FeatureResult;
      })
      .sort((a, b) => b.correlation - a.correlation);
  }, [data, targetCol, threshold]);

  const flagged = results.filter((r) => r.risk === "high");
  const safe = results.filter((r) => r.risk === "low");
  const displayRows = showAllRows ? data?.rows ?? [] : (data?.rows ?? []).slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-50 flex font-['Inter'] text-gray-900">
      {/* ── Sidebar ───────────────────────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shrink-0 shadow-sm">
        {/* Brand */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900 leading-tight">AI Bias Auditor</div>
            <div className="text-xs text-gray-400">Proxy Variable Detector</div>
          </div>
        </div>

        {/* File status */}
        <div className="px-4 pt-4">
          {!data ? (
            <button
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv";
                input.onchange = (e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const text = ev.target?.result as string;
                    const { columns, rows } = parseCSV(text);
                    const nc = numericCols(columns, rows);
                    if (nc.length >= 2) handleFile({ columns, rows, fileName: f.name, numericColumns: nc });
                  };
                  reader.readAsText(f);
                };
                input.click();
              }}
              className="w-full border-2 border-dashed border-indigo-200 rounded-xl p-4 bg-indigo-50 flex flex-col items-center gap-2 cursor-pointer hover:border-indigo-400 hover:bg-indigo-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <Upload className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-indigo-700">Upload Dataset</div>
                <div className="text-xs text-indigo-500 mt-0.5">Click to browse CSV</div>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-emerald-800 truncate">{data.fileName}</div>
                  <div className="text-xs text-emerald-600">{data.rows.length} rows · {data.columns.length} cols</div>
                </div>
                <button
                  onClick={() => { setData(null); setTargetCol(""); }}
                  className="text-emerald-400 hover:text-emerald-700 transition-colors"
                  title="Remove file"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = ".csv";
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      const { columns, rows } = parseCSV(text);
                      const nc = numericCols(columns, rows);
                      if (nc.length >= 2) handleFile({ columns, rows, fileName: f.name, numericColumns: nc });
                    };
                    reader.readAsText(f);
                  };
                  input.click();
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 py-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> Replace file
              </button>
            </div>
          )}
        </div>

        {/* Config — only when file loaded */}
        {data && (
          <div className="px-4 pt-5 flex-1 overflow-y-auto">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configuration</div>
            <div className="space-y-5">
              {/* Target column */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Target / Decision Column</label>
                <div className="relative">
                  <button
                    onClick={() => setTargetOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors"
                  >
                    <span className="truncate">{targetCol}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform shrink-0 ml-1 ${targetOpen ? "rotate-180" : ""}`} />
                  </button>
                  {targetOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                      {data.numericColumns.map((col) => (
                        <button
                          key={col}
                          onClick={() => { setTargetCol(col); setTargetOpen(false); }}
                          className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-indigo-50 transition-colors ${col === targetCol ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}
                        >
                          {col}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Threshold */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-600">Risk Threshold</label>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{threshold.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0.1} max={0.99} step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0.10 (strict)</span><span>0.99 (lenient)</span>
                </div>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                  Features with correlation ≥ this value are flagged.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats footer */}
        {data && (
          <div className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-red-50 rounded-xl p-2.5 text-center border border-red-100">
                <div className="text-2xl font-bold text-red-600">{flagged.length}</div>
                <div className="text-xs text-red-500 font-medium">Flagged</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-2.5 text-center border border-emerald-100">
                <div className="text-2xl font-bold text-emerald-600">{safe.length}</div>
                <div className="text-xs text-emerald-500 font-medium">Safe</div>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0">
        {!data ? (
          // Empty state
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 shrink-0">
              <h1 className="text-base font-bold text-gray-900">AI Bias & Proxy Variable Auditor</h1>
              <p className="text-xs text-gray-500 mt-0.5">Upload a dataset to detect hidden biases before training your model</p>
            </header>
            <UploadZone onFile={handleFile} />
          </>
        ) : (
          <>
            {/* Top bar */}
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
              <div>
                <h1 className="text-base font-bold text-gray-900">Audit Results</h1>
                <p className="text-xs text-gray-500 mt-0.5">
                  Analyzing <span className="font-semibold text-gray-700">{results.length} features</span> against target{" "}
                  <code className="bg-indigo-50 px-1.5 py-0.5 rounded text-indigo-700 font-mono text-xs border border-indigo-100">{targetCol}</code>
                  <span className="ml-2 text-gray-400">· {data.rows.length} rows</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <Download className="w-3.5 h-3.5" /> Export Report
                </button>
                <button
                  onClick={() => setThreshold(0.75)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Zap className="w-3.5 h-3.5" /> Re-run Audit
                </button>
              </div>
            </header>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-6 flex shrink-0">
              {([
                { id: "results", label: "Results", icon: BarChart2 },
                { id: "data",    label: "Data Preview", icon: Database },
                { id: "settings",label: "Settings", icon: Settings },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === id
                      ? "border-indigo-600 text-indigo-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">

              {/* ── Results ── */}
              {activeTab === "results" && (
                <div className="space-y-5 max-w-3xl">
                  {/* Summary banner */}
                  {flagged.length > 0 ? (
                    <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-amber-800">
                        <span className="font-bold">{flagged.length} feature{flagged.length !== 1 ? "s" : ""} flagged</span>{" "}
                        with correlation ≥ {threshold.toFixed(2)}.{" "}
                        These may act as proxy variables encoding hidden demographic bias into your model.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="text-sm text-emerald-800">
                        <span className="font-bold">No extreme proxy variables detected</span>{" "}
                        at the current threshold of {threshold.toFixed(2)}. Your dataset looks clean!
                      </div>
                    </div>
                  )}

                  {/* Flagged */}
                  {flagged.length > 0 && (
                    <section>
                      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        High Risk Features ({flagged.length})
                      </h2>
                      <div className="space-y-3">
                        {flagged.map((f) => (
                          <div key={f.name} className="bg-white border border-red-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <code className="text-sm font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{f.name}</code>
                                <RiskBadge risk="high" />
                              </div>
                              <TrendingUp className="w-4 h-4 text-red-400" />
                            </div>
                            <CorrelationBar value={f.correlation} risk="high" />
                            <p className="text-xs text-gray-500 mt-2.5 leading-relaxed bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                              <span className="font-semibold text-red-700">Why this matters:</span>{" "}
                              This feature strongly dictates the model's output. If it encodes demographic,
                              geographic, or lifestyle data, your AI will learn an unfair shortcut rule.
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Safe */}
                  {safe.length > 0 && (
                    <section>
                      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                        Low Risk Features ({safe.length})
                      </h2>
                      <div className="space-y-2">
                        {safe.map((f) => (
                          <div key={f.name} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <code className="text-sm font-mono font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{f.name}</code>
                                <RiskBadge risk="low" />
                              </div>
                            </div>
                            <CorrelationBar value={f.correlation} risk="low" />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* ── Data Preview ── */}
              {activeTab === "data" && (
                <div className="max-w-4xl">
                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700">Dataset Preview</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          Showing {displayRows.length} of {data.rows.length} rows
                        </span>
                        <button
                          onClick={() => setShowAllRows((s) => !s)}
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors font-medium"
                        >
                          {showAllRows ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {showAllRows ? "Show less" : "Show all"}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2.5 text-left text-xs font-bold text-gray-400 w-10">#</th>
                            {data.columns.map((col) => (
                              <th key={col} className={`px-3 py-2.5 text-left font-bold ${col === targetCol ? "text-indigo-600" : "text-gray-600"}`}>
                                <div className="flex items-center gap-1">
                                  <code>{col}</code>
                                  {col === targetCol && (
                                    <span className="text-xs font-normal text-indigo-400 bg-indigo-50 px-1 rounded">(target)</span>
                                  )}
                                  {data.numericColumns.includes(col) && col !== targetCol && (
                                    <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1 rounded">num</span>
                                  )}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((row, i) => (
                            <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                              <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                              {data.columns.map((col) => (
                                <td key={col} className={`px-3 py-2 font-mono ${col === targetCol ? "text-indigo-700 font-semibold" : "text-gray-700"}`}>
                                  {String(row[col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Settings ── */}
              {activeTab === "settings" && (
                <div className="max-w-md space-y-4">
                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Correlation Method</h3>
                    <p className="text-xs text-gray-500 mb-4">Algorithm used to measure feature-target relationships.</p>
                    <div className="space-y-2.5">
                      {[
                        { id: "pearson", label: "Pearson", desc: "Linear correlation (recommended for numeric data)" },
                        { id: "spearman", label: "Spearman", desc: "Rank-based correlation (robust to outliers)" },
                        { id: "kendall", label: "Kendall's τ", desc: "Concordance measure (smaller datasets)" },
                      ].map((m) => (
                        <label key={m.id} className="flex items-start gap-3 cursor-pointer group">
                          <input
                            type="radio" name="method" value={m.id}
                            checked={method === m.id}
                            onChange={() => setMethod(m.id)}
                            className="accent-indigo-600 mt-0.5"
                          />
                          <div>
                            <div className="text-sm font-medium text-gray-800 group-hover:text-indigo-700 transition-colors">{m.label}</div>
                            <div className="text-xs text-gray-500">{m.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Report Options</h3>
                    <p className="text-xs text-gray-500 mb-4">Configure what's included in exported reports.</p>
                    <div className="space-y-3">
                      {[
                        "Include full correlation matrix",
                        "Show feature distributions",
                        "Highlight proxy variable patterns",
                        "Generate PDF summary",
                        "Include remediation suggestions",
                      ].map((opt) => (
                        <label key={opt} className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" defaultChecked className="accent-indigo-600 w-3.5 h-3.5" />
                          <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Pearson correlation is computed on this device. No data ever leaves your browser.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
