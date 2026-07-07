import { useState, useRef, useCallback } from "react";
import {
  Shield, Upload, AlertTriangle, CheckCircle, Info,
  X, RefreshCw, FileText, ChevronDown, Download, Play, Wifi, WifiOff
} from "lucide-react";

// API base — Flask runs on port 8080
const API = `https://${location.hostname}:8080`;

interface AuditResult { name: string; correlation: number; risk: "high" | "low"; }
interface AuditResponse {
  results: AuditResult[];
  columns: string[];
  numericColumns: string[];
  rows: Record<string, string | number>[];
  totalRows: number;
  totalCols: number;
  targetCol: string;
}

function CorrelationBar({ value, risk }: { value: number; risk: "high" | "low" }) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${risk === "high" ? "bg-gradient-to-r from-red-400 to-red-600" : "bg-gradient-to-r from-emerald-400 to-emerald-500"}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-sm font-mono font-bold text-gray-700 w-12 text-right shrink-0">{value.toFixed(2)}</span>
    </div>
  );
}

export function AuditorLive() {
  const [file, setFile] = useState<File | null>(null);
  const [targetCol, setTargetCol] = useState("");
  const [threshold, setThreshold] = useState(0.75);
  const [numericCols, setNumericCols] = useState<string[]>([]);
  const [allCols, setAllCols] = useState<string[]>([]);
  const [auditData, setAuditData] = useState<AuditResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "audit">("audit");
  const [targetOpen, setTargetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [running, setRunning] = useState(false);
  const [apiError, setApiError] = useState("");
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load column list when file is picked (lightweight call)
  const loadColumns = useCallback(async (f: File) => {
    setUploadError(""); setApiError(""); setAuditData(null);
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch(`${API}/columns`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNumericCols(json.numericColumns);
      setAllCols(json.columns);
      setTargetCol(json.numericColumns[json.numericColumns.length - 1] ?? "");
      setApiOk(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUploadError(`Could not read columns: ${msg}`);
      setApiOk(false);
    }
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv")) { setUploadError("Only CSV files are supported."); return; }
    setFile(f);
    loadColumns(f);
  }, [loadColumns]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  // ── RUN AUDIT — sends to Python API ──────────────────────────────────────
  const runAudit = useCallback(async () => {
    if (!file) return;
    setRunning(true); setApiError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("target_col", targetCol);
    fd.append("threshold", String(threshold));
    try {
      const res = await fetch(`${API}/run-audit`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const json: AuditResponse = await res.json();
      if ((json as { error?: string }).error) throw new Error((json as { error?: string }).error);
      setAuditData(json);
      setTargetCol(json.targetCol);
      setActiveTab("audit");
      setApiOk(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setApiError(`Python API error: ${msg}`);
      setApiOk(false);
    } finally {
      setRunning(false);
    }
  }, [file, targetCol, threshold]);

  const flagged = auditData?.results.filter((r) => r.risk === "high") ?? [];
  const safe    = auditData?.results.filter((r) => r.risk === "low") ?? [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2 mr-1">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-800">AI Bias Auditor</span>
        </div>

        <div className="h-5 w-px bg-gray-200" />

        {/* ── THE RUN BUTTON — calls Python api.py ─── */}
        <button
          onClick={runAudit}
          disabled={!file || running}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold shadow-sm transition-all ${
            !file
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : running
              ? "bg-indigo-400 text-white cursor-wait"
              : "bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white"
          }`}
        >
          {running
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running Python…</>
            : <><Play className="w-4 h-4 fill-current" /> Run Audit</>}
        </button>

        {/* API status indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {apiOk === true  && <><Wifi    className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-600">Python connected</span></>}
          {apiOk === false && <><WifiOff className="w-3.5 h-3.5 text-red-500"     /><span className="text-red-600">API unreachable</span></>}
          {apiOk === null  && <span className="text-gray-400">Upload a CSV to connect</span>}
        </div>

        <div className="flex-1" />

        {file && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-medium text-emerald-700">
            <FileText className="w-3 h-3" />
            {file.name}
            <button onClick={() => { setFile(null); setAuditData(null); setAllCols([]); setNumericCols([]); setApiOk(null); }} className="ml-1 text-emerald-400 hover:text-emerald-700">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">

          <div className="px-4 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Data Input</p>
            {file ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-emerald-800 truncate">{file.name}</div>
                    {auditData && <div className="text-xs text-emerald-600">{auditData.totalRows} rows · {auditData.totalCols} cols</div>}
                  </div>
                </div>
                <button onClick={() => inputRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 py-1 font-medium transition-colors">
                  <RefreshCw className="w-3 h-3" /> Replace file
                </button>
              </div>
            ) : (
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
            )}
            {uploadError && <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{uploadError}</p>}
            <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {/* Configure Audit */}
          {numericCols.length >= 2 && (
            <div className="px-4 pt-5 flex-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Configure Audit</p>
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1.5">Target variable</label>
                  <div className="relative">
                    <button onClick={() => setTargetOpen((o) => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-800 hover:border-indigo-400 transition-colors">
                      <span className="truncate">{targetCol}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 shrink-0 ml-1 transition-transform ${targetOpen ? "rotate-180" : ""}`} />
                    </button>
                    {targetOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        {numericCols.map((col) => (
                          <button key={col} onClick={() => { setTargetCol(col); setTargetOpen(false); }} className={`w-full px-3 py-2 text-left text-sm font-mono hover:bg-indigo-50 transition-colors ${col === targetCol ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}>{col}</button>
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
                  <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">Features correlating higher than this will be flagged as high risk.</p>
                </div>
              </div>
            </div>
          )}

          {/* Counts */}
          {auditData && (
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

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0 overflow-auto">
          <div className="p-5 space-y-5">
            <div>
              <h1 className="text-base font-bold text-gray-900">🛡️ AI Bias & Proxy Variable Auditor</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Audits datasets to find <strong>Hidden Biases</strong> and <strong>Proxy Variables</strong> before training AI models.
                {auditData && <span className="ml-2 text-indigo-600 font-medium">✓ Results from Python (pandas)</span>}
              </p>
            </div>

            {/* Error banner */}
            {apiError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <strong>Error running audit:</strong> {apiError}
                  <div className="text-xs mt-1 text-red-500">Make sure the Python API server (api.py) is running.</div>
                </div>
              </div>
            )}

            {/* No file yet */}
            {!file && !running && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span><strong>Getting Started:</strong> Upload a CSV in the sidebar, then press <strong>Run Audit</strong> — your Python code runs and results appear here.</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Example CSV format</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs font-mono">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">{["coding_score","zip_code","uses_dark_mode","approved"].map((h) => <th key={h} className="px-3 py-2 text-left font-bold text-gray-600">{h}</th>)}</tr></thead>
                    <tbody>{[[95,10001,1,1],[42,90210,0,0],[78,10001,1,1]].map((row,i) => <tr key={i} className={i%2===0?"bg-white":"bg-gray-50"}>{row.map((v,j) => <td key={j} className="px-3 py-2 text-gray-700">{v}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Running spinner */}
            {running && (
              <div className="flex items-center gap-3 p-5 bg-white border border-indigo-200 rounded-xl shadow-sm">
                <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-indigo-700">Running your Python code…</p>
                  <p className="text-xs text-indigo-500 mt-0.5">Computing Pearson correlations with pandas</p>
                </div>
              </div>
            )}

            {/* Results */}
            {auditData && !running && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {(["preview","audit"] as const).map((t) => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-5 py-2.5 text-xs font-semibold transition-colors border-b-2 ${activeTab===t?"border-indigo-600 text-indigo-600":"border-transparent text-gray-500 hover:text-gray-700"}`}>
                      {t==="preview" ? "📊 Data Preview" : "🔍 Audit Results & Risk Analysis"}
                    </button>
                  ))}
                </div>

                {/* Data Preview */}
                {activeTab === "preview" && (
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4 text-sm text-gray-600">
                      <span>Rows: <strong className="text-gray-900">{auditData.totalRows}</strong></span>
                      <span className="text-gray-300">·</span>
                      <span>Columns: <strong className="text-gray-900">{auditData.totalCols}</strong></span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {auditData.columns.map((col) => (
                              <th key={col} className={`px-3 py-2.5 text-left font-bold ${col===auditData.targetCol?"text-indigo-600":"text-gray-600"}`}>
                                <code>{col}</code>{col===auditData.targetCol&&<span className="ml-1 text-indigo-400 font-normal">(target)</span>}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {auditData.rows.map((row, i) => (
                            <tr key={i} className={`border-b border-gray-50 ${i%2===0?"bg-white":"bg-gray-50/50"}`}>
                              {auditData.columns.map((col) => (
                                <td key={col} className={`px-3 py-2 font-mono ${col===auditData.targetCol?"text-indigo-700 font-semibold":"text-gray-700"}`}>{String(row[col])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {auditData.totalRows > 10 && <p className="mt-2 text-xs text-gray-400 text-center">Showing first 10 of {auditData.totalRows} rows</p>}
                  </div>
                )}

                {/* Audit Results — from Python */}
                {activeTab === "audit" && (
                  <div className="p-5 space-y-3">
                    {flagged.length === 0 ? (
                      <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <CheckCircle className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-emerald-800">🎉 No extreme correlations found!</p>
                          <p className="text-sm text-emerald-700 mt-0.5">Your dataset appears to be free of hidden biases at threshold {threshold.toFixed(2)}.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">
                          <strong>{flagged.length} feature{flagged.length!==1?"s":""} flagged</strong> with correlation ≥ {threshold.toFixed(2)}. These may act as proxy variables encoding hidden bias.
                        </p>
                      </div>
                    )}

                    {auditData.results.map((r) => (
                      <div key={r.name} className={`rounded-xl border p-4 shadow-sm ${r.risk==="high"?"bg-red-50 border-red-200":"bg-white border-gray-200"}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {r.risk==="high"
                            ? <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertTriangle className="w-3.5 h-3.5"/>High Risk!</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle className="w-3.5 h-3.5"/>LOW RISK</span>}
                          <span className="text-xs text-gray-500">| Feature</span>
                          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${r.risk==="high"?"bg-red-100 text-red-800":"bg-gray-100 text-gray-800"}`}>{r.name}</code>
                          <span className="text-xs text-gray-500">has a {r.risk==="low"?"safe ":""}correlation of <strong>{r.correlation.toFixed(2)}</strong> with <code className="bg-indigo-50 text-indigo-700 px-1 rounded">{auditData.targetCol}</code></span>
                        </div>
                        <CorrelationBar value={r.correlation} risk={r.risk} />
                        {r.risk==="high" && (
                          <p className="text-xs text-red-700 mt-2.5 leading-relaxed bg-red-100 rounded-lg px-3 py-2">
                            <span className="font-semibold">Why this matters:</span> This feature strongly dictates the AI's behavior. If <code className="font-mono">{r.name}</code> is a biased or irrelevant metric, the model will learn an unfair shortcut rule.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
